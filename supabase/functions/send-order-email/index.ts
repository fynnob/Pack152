import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function generateReferenceCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

const bankDetailsTransitionMessage =
  "We are currently in a transition phase between treasurers and will share our bank details with you shortly.";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { orderId, email, targetStatus } = body;

    if (!orderId) {
      throw new Error("Missing orderId in request body");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      throw new Error(
        `Order fetch error: ${fetchError?.message || "Order not found"}`
      );
    }

    let recipientEmail = email || order.email;

    if (!recipientEmail && order.user_id) {
      const { data: userData } =
        await supabase.auth.admin.getUserById(order.user_id);

      recipientEmail = userData?.user?.email;
    }

    if (!recipientEmail) {
      throw new Error(`No recipient email found for order ${orderId}`);
    }

    const currentStatus =
      targetStatus || order.status || "Ordered (on platform)";

    const refCode = order.reference_code || generateReferenceCode();

    if (!order.reference_code) {
      await supabase
        .from("orders")
        .update({ reference_code: refCode })
        .eq("id", orderId);
    }

    const gmailUser =
      Deno.env.get("GMAIL_USER") ||
      Deno.env.get("SMTP2GO_USERNAME");

    const gmailAppPass = (
      Deno.env.get("GMAIL_APP_PASS") ||
      Deno.env.get("SMTP2GO_PASSWORD") ||
      ""
    ).replace(/\s+/g, "");

    if (!gmailUser || !gmailAppPass) {
      throw new Error(
        "GMAIL_USER or GMAIL_APP_PASS environment variables are missing"
      );
    }

    const itemsListHtml = (order.items || [])
      .map(
        (item: any) => `
          <li style="margin-bottom: 6px;">
            <strong>${item.name}</strong>
            ${item.size ? `(Size: ${item.size})` : ""}
            <code style="background:#f1f5f9; padding:2px 4px; border-radius:3px;">
              [SKU: ${item.sku || "N/A"}]
            </code>
            x${item.quantity} —
            <strong>$${(
              Number(item.price || 0) * Number(item.quantity || 0)
            ).toFixed(2)}</strong>
          </li>
        `
      )
      .join("");

    let subject = "";
    let statusMessage = "";

    switch (currentStatus) {
      case "Payment Reminder":
        subject = `Bank Details — Pack 152 Order Ref: ${refCode}`;

        statusMessage = `
          <div style="background:#fff7ed; border:1px solid #fed7aa; padding:16px; border-radius:8px; margin-bottom:16px;">
            <h3 style="color:#c2410c; margin:0 0 8px 0;">
              Our bank details
            </h3>

            <p style="margin:0 0 10px 0; color:#9a3412;">
              Here are our bank details for your order. Please use the reference below when making your transfer.
            </p>

            <p style="margin:0 0 10px 0; color:#9a3412;">
              Your order will be placed with ScoutShop once payment has gone through.
            </p>
          </div>

          <div style="background:#f8fafc; border:1px solid #cbd5e1; padding:16px; border-radius:8px;">
            <p style="margin:4px 0;">
              <strong>Account Name:</strong> John Doe
            </p>

            <p style="margin:4px 0;">
              <strong>IBAN:</strong> DEXX XXXX XXXX XXXX XXXX XX
            </p>

            <p style="margin:4px 0;">
              <strong>Transaction Reason / Reference:</strong>
              <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; font-weight:bold; border-radius:4px;">
                ${refCode} - Order
              </span>
            </p>
          </div>
        `;
        break;

      case "Payment Verified":
        subject = `Payment Verified — Pack 152 Order Ref: ${refCode}`;

        statusMessage = `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:16px; border-radius:8px; margin-bottom:16px;">
            <h3 style="color:#166534; margin:0 0 8px 0;">
              Payment Received & Verified
            </h3>

            <p style="margin:0; color:#15803d;">
              We have received and verified your payment. Your order is now
              ready for procurement.
            </p>
          </div>
        `;
        break;

      case "Order Placed (inside scout shop)":
        subject = `Order Placed with Scout Shop — Ref: ${refCode}`;

        statusMessage = `
          <p>
            Your items have been officially ordered through ScoutShop and are
            processing for delivery.
          </p>
        `;
        break;

      case "Delivered":
        subject = `Gear Handed Over & Delivered — Ref: ${refCode}`;

        statusMessage = `
          <p>
            Your Scout gear has been handed over to you. Thank you!
          </p>
        `;
        break;

      default:
        subject = `Pack 152 Order Confirmation — Ref: ${refCode}`;

        statusMessage = `
          <p>
            Your order has been recorded. Below are your order details.
          </p>

          <p>
            ${bankDetailsTransitionMessage}
          </p>

          <p>
            <strong>Transaction Reason / Reference:</strong>
            <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; font-weight:bold; border-radius:4px;">
              ${refCode} - Order
            </span>
          </p>
        `;
        break;
    }

    const emailHtml = `
      <div style="font-family:Arial, sans-serif; color:#1e293b; max-width:600px; margin:0 auto;">
        <h2 style="color:#16a34a;">
          Hello ${order.parent_name || "Pack 152 family"},
        </h2>

        ${statusMessage}

        <h3 style="border-bottom:2px solid #e2e8f0; padding-bottom:4px; margin-top:20px;">
          Order Summary
        </h3>

        <ul style="padding-left:20px;">
          ${itemsListHtml}
        </ul>

        <p style="font-size:1.1em;">
          <strong>
            Total Amount: $${Number(order.total_amount || 0).toFixed(2)}
          </strong>
        </p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailAppPass,
      },
      connectionTimeout: 10000,
    });

    const info = await transporter.sendMail({
      from: `"Pack 152 Berlin" <${gmailUser}>`,
      to: recipientEmail,
      subject,
      html: emailHtml,
    });

    return new Response(
      JSON.stringify({
        success: true,
        referenceCode: refCode,
        messageId: info.messageId,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err: any) {
    console.error("send-order-email failed:", err);

    return new Response(
      JSON.stringify({
        error: err.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
