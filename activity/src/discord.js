import {
  DiscordSDK,
  Common
} from "@discord/embedded-app-sdk";

let discordSdk = null;
let auth = null;

let layoutTrackingStarted =
  false;


function applyDiscordLayoutMode(
  layoutMode
) {
  let mode =
    "unknown";

  switch (layoutMode) {
    case Common
      .LayoutModeTypeObject
      .FOCUSED:
      mode = "focused";
      break;

    case Common
      .LayoutModeTypeObject
      .PIP:
      mode = "pip";
      break;

    case Common
      .LayoutModeTypeObject
      .GRID:
      mode = "grid";
      break;

    default:
      mode = "unknown";
  }

  document.documentElement
    .dataset.discordLayout =
      mode;

  console.log(
    `✓ Discord Activity layout: ${mode}`
  );
}


async function startLayoutTracking(
  sdk
) {
  if (
    layoutTrackingStarted ||
    !sdk
  ) {
    return;
  }

  layoutTrackingStarted =
    true;

  const handleLayoutUpdate =
    (update) => {
      applyDiscordLayoutMode(
        update?.layout_mode
      );
    };

  /*
   * Discord recommends the compat subscription because
   * older clients expose PIP updates differently.
   */
  if (
    typeof sdk
      .subscribeToLayoutModeUpdatesCompat ===
      "function"
  ) {
    await sdk
      .subscribeToLayoutModeUpdatesCompat(
        handleLayoutUpdate
      );

    return;
  }

  /*
   * Fallback for clients / SDK versions that only expose
   * the standard Activity layout event.
   */
  await sdk.subscribe(
    "ACTIVITY_LAYOUT_MODE_UPDATE",
    handleLayoutUpdate
  );
}

function isLocalDevelopment() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function isDiscordActivity() {
  return (
    window.self !== window.top
  );
}

function getDiscordSdk() {
  if (discordSdk) {
    return discordSdk;
  }

  if (isLocalDevelopment()) {
    return null;
  }

  discordSdk =
    new DiscordSDK(
      import.meta.env.VITE_DISCORD_CLIENT_ID
    );

  return discordSdk;
}

export async function initializeDiscord() {
  /*
   * Localhost development.
   */
  if (isLocalDevelopment()) {
    console.log(
      "✓ Creator Deals localhost development mode"
    );

    auth = {
      development: true
    };

    return {
      auth,
      accessToken: null
    };
  }

  /*
   * Normal partnerlinks.app browser.
   * Do not initialize Discord's Embedded App SDK.
   */
  if (!isDiscordActivity()) {
    return {
      auth: null,
      accessToken: null,
      browser: true
    };
  }

  const sdk =
    getDiscordSdk();

  await sdk.ready();

  console.log(
    "✓ Discord Activity SDK ready"
  );

  await startLayoutTracking(
    sdk
  );

  const {
    code
  } =
    await sdk.commands.authorize({
      client_id:
        import.meta.env
          .VITE_DISCORD_CLIENT_ID,

      response_type:
        "code",

      state:
        "",

      prompt:
        "none",

      scope: [
        "identify"
      ]
    });

  if (!code) {
    throw new Error(
      "Discord authorization did not return a code"
    );
  }

  const tokenResponse =
    await fetch(
      "/api/token",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            code
          })
      }
    );

  const tokenData =
    await tokenResponse.json();

  if (
    !tokenResponse.ok ||
    !tokenData?.access_token
  ) {
    throw new Error(
      tokenData?.error ||
      "Discord token exchange failed"
    );
  }

  const accessToken =
    tokenData.access_token;

  auth =
    await sdk.commands.authenticate({
      access_token:
        accessToken
    });

  if (!auth) {
    throw new Error(
      "Discord authentication failed"
    );
  }

  console.log(
    `✓ Authenticated Discord user ${auth.user?.username || auth.user?.id || ""}`
  );

  return {
    auth,
    accessToken
  };
}

export function getAuth() {
  return auth;
}

export async function openExternal(url) {
  if (!url) {
    return;
  }

  if (isLocalDevelopment()) {
    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    return;
  }

  const sdk =
    getDiscordSdk();

  await sdk.commands
    .openExternalLink({
      url
    });
}
