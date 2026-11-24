
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json"
  };

  const reply = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Méthode non autorisée." });
  }

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;

    if (!secretKey || !siteUrl) {
      return reply(500, {
        error: "Configuration Stripe ou Netlify incomplète."
      });
    }

    const contentType =
      event.headers?.["content-type"] ||
      event.headers?.["Content-Type"] || "";

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!boundaryMatch) {
      return reply(400, { error: "Format de commande invalide." });
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const raw = Buffer.from(
      event.body || "",
      event.isBase64Encoded ? "base64" : "utf8"
    );

    const parts = raw.toString("latin1").split(`--${boundary}`);
    const fields = {};

    for (const part of parts) {
      const separator = part.indexOf("\r\n\r\n");
      if (separator < 0) continue;

      const partHeaders = part.slice(0, separator);
      const disposition = partHeaders.match(
        /content-disposition:\s*form-data;[^\r\n]*name="([^"]+)"/i
      );

      if (!disposition) continue;

      const name = disposition[1];

      // La photo sera traitée séparément dans une prochaine étape.
      if (/filename="/i.test(partHeaders)) continue;

      let value = part.slice(separator + 4);
      value = value.replace(/\r\n$/, "").replace(/--$/, "");

      fields[name] = Buffer.from(value, "latin1").toString("utf8");
    }

    const products = {
      "texte": {
        name: "Mug personnalisé - Prénom ou texte simple",
        amount: 1000
      },
      "photo": {
        name: "Mug personnalisé - Avec photo",
        amount: 1200
      },
      "photo-texte": {
        name: "Mug personnalisé - Photo et texte",
        amount: 1300
      },
      "montage": {
        name: "Mug personnalisé - Montage photo",
        amount: 1400
      },
      "complete": {
        name: "Mug personnalisé - Personnalisation complète",
        amount: 1500
      }
    };

    const product = products[fields.personalisation];
    const delivery = fields.delivery;

    if (!product) {
      return reply(400, { error: "Personnalisation invalide." });
    }

    if (!["pickup", "shipping"].includes(delivery)) {
      return reply(400, { error: "Mode de réception invalide." });
    }

    const customerName = (fields.customer_name || "").trim();
    const customerEmail = (fields.customer_email || "").trim();
    const comment = (fields.commentaire || "").trim();

    if (!customerName || customerName.length > 100) {
      return reply(400, { error: "Veuillez vérifier votre nom." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return reply(400, { error: "Adresse e-mail invalide." });
    }

    const params = new URLSearchParams();

    params.append("mode", "payment");
    params.append("customer_email", customerEmail);

    params.append("line_items[0][price_data][currency]", "eur");
    params.append("line_items[0][price_data][unit_amount]", String(product.amount));
    params.append("line_items[0][price_data][product_data][name]", product.name);
    params.append("line_items[0][quantity]", "1");

    if (delivery === "shipping") {
      params.append("line_items[1][price_data][currency]", "eur");
      params.append("line_items[1][price_data][unit_amount]", "700");
      params.append(
        "line_items[1][price_data][product_data][name]",
        "Livraison postale"
      );
      params.append("line_items[1][quantity]", "1");
    }

    params.append("metadata[customer_name]", customerName);
    params.append("metadata[personalisation]", fields.personalisation);
    params.append("metadata[delivery]", delivery);
    params.append("metadata[commentaire]", comment.slice(0, 500));

    params.append(
      "success_url",
      `${siteUrl}/?success=true&session_id={CHECKOUT_SESSION_ID}`
    );

    params.append("cancel_url", `${siteUrl}/?cancelled=true`);

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );

    const session = await response.json();

    if (!response.ok || !session.url) {
  console.error("Erreur Stripe :", JSON.stringify(session));
  return reply(400, {
    error: session.error?.message || "Stripe n'a pas pu préparer le paiement."
  });
}

    return reply(200, { url: session.url });

  } catch (error) {
    return reply(500, {
      error: "Une erreur serveur est survenue."
    });
  }
};


    
