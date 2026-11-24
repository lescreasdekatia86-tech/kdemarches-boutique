
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Méthode non autorisée"
      })
    };
  }

  try {
    const params = new URLSearchParams();

    params.append("mode", "payment");
    params.append(
      "line_items[0][price]",
      "price_1Uf4hBACoZJOTwN8sMn0hb1q"
    );
    params.append("line_items[0][quantity]", "1");

    params.append(
      "success_url",
      `${process.env.URL}/?success=true`
    );

    params.append(
      "cancel_url",
      `${process.env.URL}/?cancelled=true`
    );

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      }
    );

    const session = await response.json();

    if (!response.ok) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Impossible de créer le paiement Stripe."
        })
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: session.url
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Une erreur serveur est survenue."
      })
    };
  }
};
