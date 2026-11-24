
const crypto = require("crypto");

exports.handler = async (event) => {
  const reply = (statusCode, data) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Méthode non autorisée." });
  }

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const resendKey = process.env.RESEND_API_KEY;

    if (!webhookSecret || !resendKey) {
      console.error("Configuration webhook ou Resend manquante.");
      return reply(500, { error: "Configuration incomplète." });
    }

    const signature =
      event.headers?.["stripe-signature"] ||
      event.headers?.["Stripe-Signature"];

    if (!signature) {
      return reply(400, { error: "Signature Stripe absente." });
    }

    const rawBody = Buffer.from(
      event.body || "",
      event.isBase64Encoded ? "base64" : "utf8"
    );

    const parts = signature.split(",").map(x => x.split("="));
    const timestamp = parts.find(x => x[0] === "t")?.[1];
    const signatures = parts
      .filter(x => x[0] === "v1")
      .map(x => x[1]);

    if (!timestamp || !signatures.length) {
      return reply(400, { error: "Signature invalide." });
    }

    const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const valid = signatures.some(sig => {
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });

    if (!valid || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return reply(400, { error: "Signature Stripe invalide." });
    }

    const stripeEvent = JSON.parse(rawBody.toString("utf8"));

    if (stripeEvent.type !== "checkout.session.completed") {
      return reply(200, { received: true });
    }

    const session = stripeEvent.data.object;
    const metadata = session.metadata || {};

    const escapeHtml = value =>
      String(value || "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);

    const amount = ((session.amount_total || 0) / 100)
      .toFixed(2)
      .replace(".", ",");

    const delivery = metadata.delivery === "shipping"
      ? "Envoi postal"
      : "Retrait à domicile à Chamberet";

    const html = `
      <h2>Nouvelle commande payée !</h2>
      <p><strong>Nom :</strong> ${escapeHtml(metadata.customer_name)}</p>
      <p><strong>E-mail client :</strong> ${escapeHtml(session.customer_details?.email || session.customer_email)}</p>
      <p><strong>Personnalisation :</strong> ${escapeHtml(metadata.personalisation)}</p>
      <p><strong>Réception :</strong> ${escapeHtml(delivery)}</p>
      ${metadata.photo_url ? '<p><strong>Photo du client :</strong> <a href="' + escapeHtml(metadata.photo_url) + '">Ouvrir la photo</a></p>' : ''}
      <p><strong>Total payé :</strong> ${amount} €</p>
      <p>Commande confirmée par Stripe.</p>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "K'démarches & créations <onboarding@resend.dev>",
        to: ["lescreasdekatia86@gmail.com"],
        subject: "Nouvelle commande payée",
        html
      })
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Erreur Resend :", errorText);
      return reply(500, { error: "Envoi de l'e-mail impossible." });
    }

    return reply(200, { received: true });

  } catch (error) {
    console.error("Erreur webhook :", error.message);
    return reply(500, { error: "Erreur serveur." });
  }
};
