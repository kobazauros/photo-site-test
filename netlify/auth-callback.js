export async function handler(event) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const siteUrl = process.env.SITE_URL;

  if (!clientId || !clientSecret || !siteUrl) {
    return {
      statusCode: 500,
      body: "Missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SITE_URL env vars"
    };
  }

  // GitHub redirected back here with ?code=...
  const url = new URL(event.rawUrl);
  const code = url.searchParams.get("code");

  if (!code) {
    return {
      statusCode: 400,
      body: "Missing OAuth code"
    };
  }

  // Exchange GitHub's temporary code for an access token
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  });

  const tokenJSON = await tokenResponse.json();

  // tokenJSON should look like { access_token: "...", token_type: "bearer", scope: "repo,user" }
  if (!tokenJSON.access_token) {
    return {
      statusCode: 401,
      body: "No access token from GitHub"
    };
  }

  // Return the token to Decap CMS
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      // allow the CMS in your browser to read it
      "Access-Control-Allow-Origin": siteUrl,
      "Access-Control-Allow-Credentials": "true"
    },
    body: JSON.stringify(tokenJSON)
  };
}
