require("dotenv").config();

const Database = require("better-sqlite3");

const {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  FileUploadBuilder,
  StringSelectMenuBuilder,
  MediaGalleryBuilder,
  MessageFlags,
} = require("discord.js");

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* =========================================================
   DATABASE
========================================================= */

const db = new Database("creator-deals.db");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    commission TEXT NOT NULL,

    shop_ads TEXT NOT NULL DEFAULT '—',
    free_sample TEXT NOT NULL DEFAULT 'Auto-Approved',
    requirements TEXT NOT NULL DEFAULT '1 TikTok Shoppable Video',
    brand_website TEXT NOT NULL DEFAULT '',

    image_blob BLOB,
    image_filename TEXT,
    image_mime TEXT,
    image_url TEXT,

    active INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS creator_profiles (
    discord_user_id TEXT PRIMARY KEY,
    tiktok_handle TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS product_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_user_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    tiktok_handle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/* =========================================================
   REQUEST DELIVERY TRACKING
========================================================= */

const requestColumns =
  new Set(
    db.prepare(
      "PRAGMA table_info(product_requests)"
    )
      .all()
      .map((row) => row.name)
  );

if (
  !requestColumns.has("sent_at")
) {
  db.exec(
    "ALTER TABLE product_requests ADD COLUMN sent_at TEXT"
  );

  console.log(
    "✓ Added product_requests.sent_at"
  );
}


if (
  !requestColumns.has("source")
) {
  db.exec(
    "ALTER TABLE product_requests ADD COLUMN source TEXT NOT NULL DEFAULT 'activity'"
  );

  console.log(
    "✓ Added product_requests.source"
  );
}

const productColumns =
  new Set(
    db.prepare(
      "PRAGMA table_info(products)"
    )
      .all()
      .map((row) => row.name)
  );


if (
  !productColumns.has(
    "image_key"
  )
) {
  db.exec(
    "ALTER TABLE products ADD COLUMN image_key TEXT"
  );

  console.log(
    "✓ Added products.image_key"
  );
}

if (
  !productColumns.has(
    "variants_enabled"
  )
) {
  db.exec(
    "ALTER TABLE products ADD COLUMN variants_enabled INTEGER NOT NULL DEFAULT 0"
  );

  console.log(
    "✓ Added products.variants_enabled"
  );
}

if (
  !productColumns.has(
    "variant_selection_limit"
  )
) {
  db.exec(
    "ALTER TABLE products ADD COLUMN variant_selection_limit INTEGER NOT NULL DEFAULT 1"
  );

  console.log(
    "✓ Added products.variant_selection_limit"
  );
}

db.exec(`
  CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    external_product_id TEXT,
    image_blob BLOB,
    image_filename TEXT,
    image_mime TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS
  idx_product_variants_product_id
  ON product_variants (
    product_id,
    position
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS product_request_variants (
    request_id INTEGER NOT NULL,
    variant_id INTEGER,
    variant_name_snapshot TEXT NOT NULL,
    external_product_id_snapshot TEXT,
    position INTEGER NOT NULL DEFAULT 0
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS
  idx_product_request_variants_request_id
  ON product_request_variants (
    request_id,
    position
  )
`);


if (
  !productColumns.has(
    "announcement_sent_at"
  )
) {
  db.exec(
    "ALTER TABLE products ADD COLUMN announcement_sent_at TEXT"
  );

  /*
   * Existing production deals must NOT be announced when this
   * feature is first deployed. Only products created after this
   * migration should enter the new-deal announcement flow.
   */
  db.exec(`
    UPDATE products
    SET announcement_sent_at =
      CURRENT_TIMESTAMP
    WHERE announcement_sent_at IS NULL
  `);

  console.log(
    "✓ Added products.announcement_sent_at and marked existing deals handled"
  );
}

/* =========================================================
   INITIAL PRODUCTS

   These only seed the DB if the DB is empty.
   Once created, use the Admin Dashboard instead of code.
========================================================= */

const existingCount = db
  .prepare("SELECT COUNT(*) AS c FROM products")
  .get().c;

if (existingCount === 0) {
  const seed = db.prepare(`
    INSERT INTO products (
      name,
      brand,
      category,
      commission,
      shop_ads,
      free_sample,
      requirements,
      brand_website,
      image_url,
      active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  seed.run(
    "FlowFit Activewear Set",
    "FlowFit",
    "Fashion",
    "20%",
    "+15%",
    "Auto-Approved",
    "1 TikTok Shoppable Video",
    "https://example.com",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800"
  );

  seed.run(
    "Aura Jewelry Bundle",
    "Aura",
    "Fashion",
    "18%",
    "—",
    "Auto-Approved",
    "1 TikTok Shoppable Video",
    "https://example.com",
    "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800"
  );

  seed.run(
    "Urban Streetwear Hoodie",
    "Urban Co.",
    "Fashion",
    "15%",
    "—",
    "Auto-Approved",
    "1 TikTok Shoppable Video",
    "https://example.com",
    "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=800"
  );

  seed.run(
    "Canvas Tote Bag",
    "Canvas Co.",
    "Fashion",
    "12%",
    "—",
    "Auto-Approved",
    "1 TikTok Shoppable Video",
    "https://example.com",
    "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=800"
  );

  seed.run(
    "Classic Sunglasses",
    "Classic",
    "Fashion",
    "10%",
    "—",
    "Auto-Approved",
    "1 TikTok Shoppable Video",
    "https://example.com",
    "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800"
  );

  console.log("✓ Initial products added to SQLite");
}

/* =========================================================
   STATE
========================================================= */

let publicMessage = null;
let adminMessage = null;

let adminSelectedProductId = null;

/* =========================================================
   DATABASE HELPERS
========================================================= */

function productById(id) {
  return db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(String(id));
}

function productVariants(
  productId
) {
  return db
    .prepare(`
      SELECT
        id,
        position,
        name,
        external_product_id
      FROM product_variants
      WHERE product_id = ?
      ORDER BY
        position ASC,
        id ASC
    `)
    .all(
      String(productId)
    );
}


function defaultProductVariant(
  productId
) {
  return db
    .prepare(`
      SELECT
        id,
        position,
        name,
        external_product_id
      FROM product_variants
      WHERE product_id = ?
      ORDER BY
        position ASC,
        id ASC
      LIMIT 1
    `)
    .get(
      String(productId)
    ) || null;
}


function productHasSelectableVariants(
  product
) {
  return Boolean(
    product &&
    Number(
      product.variants_enabled
    ) === 1 &&
    defaultProductVariant(
      product.id
    )
  );
}


function saveDefaultRequestVariant(
  requestId,
  productId
) {
  const variant =
    defaultProductVariant(
      productId
    );

  if (!variant) {
    return;
  }

  db.prepare(`
    INSERT INTO product_request_variants (
      request_id,
      variant_id,
      variant_name_snapshot,
      external_product_id_snapshot,
      position
    )
    VALUES (?, ?, ?, ?, 1)
  `).run(
    Number(requestId),
    Number(variant.id),
    variant.name || "",
    variant.external_product_id ||
      null
  );
}


function requestVariants(
  requestId
) {
  return db
    .prepare(`
      SELECT
        variant_name_snapshot,
        external_product_id_snapshot,
        position
      FROM product_request_variants
      WHERE request_id = ?
      ORDER BY
        position ASC,
        rowid ASC
    `)
    .all(
      Number(requestId)
    );
}


function makeProductId(name) {
  const base =
    String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "product";

  let id = base;
  let suffix = 2;

  while (productById(id)) {
    id = `${base}-${suffix++}`;
  }

  return id;
}

function activeProducts(category = "all") {
  if (category === "all") {
    return db
      .prepare(`
        SELECT *
        FROM products
        WHERE active = 1
        ORDER BY id DESC
      `)
      .all();
  }

  return db
    .prepare(`
      SELECT *
      FROM products
      WHERE active = 1
      AND lower(category) = lower(?)
      ORDER BY id DESC
    `)
    .all(category);
}

function allProducts() {
  return db
    .prepare(`
      SELECT *
      FROM products
      ORDER BY id DESC
    `)
    .all();
}

function getTikTok(userId) {
  return (
    db
      .prepare(`
        SELECT tiktok_handle
        FROM creator_profiles
        WHERE discord_user_id = ?
      `)
      .get(userId)?.tiktok_handle || null
  );
}

function saveTikTok(userId, handle) {
  db.prepare(`
    INSERT INTO creator_profiles (
      discord_user_id,
      tiktok_handle,
      updated_at
    )
    VALUES (?, ?, CURRENT_TIMESTAMP)

    ON CONFLICT(discord_user_id)
    DO UPDATE SET
      tiktok_handle = excluded.tiktok_handle,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, handle);
}

function hasRequestedProduct(
  userId,
  productId
) {
  return Boolean(
    db.prepare(`
      SELECT id
      FROM product_requests
      WHERE discord_user_id = ?
      AND CAST(product_id AS TEXT) = ?
      LIMIT 1
    `).get(
      String(userId),
      String(productId)
    )
  );
}

function insertProductRequest(
  userId,
  productId,
  handle,
  source
) {
  return db.prepare(`
    INSERT INTO product_requests (
      discord_user_id,
      product_id,
      tiktok_handle,
      status,
      source
    )
    VALUES (?, ?, ?, 'pending', ?)
  `).run(
    String(userId),
    String(productId),
    handle,
    source
  );
}

function requestSourceLabel(source) {
  return source === "quick_request"
    ? "Quick Request"
    : "Activity";
}


async function sendAdminRequestPing(
  productId
) {
  try {
    const channelId =
      process.env
        .MARKETPLACE_ADMIN_CHANNEL_ID;

    const adminUserId =
      process.env
        .ADMIN_DISCORD_USER_ID;

    const token =
      process.env.DISCORD_TOKEN;

    if (
      !channelId ||
      !adminUserId ||
      !token
    ) {
      console.error(
        "Request notification skipped: missing Discord notification env"
      );

      return;
    }

    const product =
      productById(
        productId
      );

    const productName =
      product?.name ||
      "Creator Deal";

    const response =
      await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bot ${token}`,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              content:
                `<@${adminUserId}> 🔔 New creator deal request — **${productName}**`,

              allowed_mentions: {
                parse: [],

                users: [
                  String(
                    adminUserId
                  )
                ]
              }
            })
        }
      );

    if (!response.ok) {
      console.error(
        "Request notification send failed:",
        response.status,
        await response.text()
      );

      return;
    }

    const message =
      await response.json();

    /*
     * Leave the ping visible only briefly.
     * Discord can deliver the mention notification,
     * but the admin channel does not accumulate messages.
     */
    const timer =
      setTimeout(
        async () => {
          try {
            const deleteResponse =
              await fetch(
                `https://discord.com/api/v10/channels/${channelId}/messages/${message.id}`,
                {
                  method:
                    "DELETE",

                  headers: {
                    Authorization:
                      `Bot ${token}`
                  }
                }
              );

            if (
              !deleteResponse.ok &&
              deleteResponse.status !== 404
            ) {
              console.error(
                "Request notification cleanup failed:",
                deleteResponse.status
              );
            }

          } catch (error) {
            console.error(
              "Request notification cleanup error:",
              error
            );
          }
        },
        5000
      );

    timer.unref?.();

  } catch (error) {
    /*
     * A notification failure must NEVER
     * interfere with the creator's request.
     */
    console.error(
      "Request notification error:",
      error
    );
  }
}


function componentHasCustomId(
  component,
  customId
) {
  if (!component) {
    return false;
  }

  if (
    component.customId === customId ||
    component.custom_id === customId
  ) {
    return true;
  }

  const children =
    component.components ||
    component.data?.components ||
    [];

  return Array.isArray(children) &&
    children.some(
      (child) =>
        componentHasCustomId(
          child,
          customId
        )
    );
}

function messageHasCustomId(
  message,
  customId
) {
  return (
    message.components || []
  ).some(
    (component) =>
      componentHasCustomId(
        component,
        customId
      )
  );
}

/* =========================================================
   UI HELPERS
========================================================= */

function v2(components, extra = {}) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components,
    ...extra,
  };
}

function productMedia(product, prefix = "product") {
  /*
   * New product images are stored in Cloudflare R2.
   * Discord loads them through the public Activity API,
   * which handles the signed R2 redirect.
   */
  if (product.image_key) {
    return {
      url:
        `https://framepoint.app/api/products/${encodeURIComponent(
          product.id
        )}/image?v=${encodeURIComponent(
          product.updated_at || Date.now()
        )}`,
      files: [],
    };
  }

  /*
   * Legacy SQLite image fallback.
   */
  if (product.image_blob && product.image_filename) {
    const safeFilename =
      `${prefix}-${product.id}-${product.image_filename}`
        .replace(/[^a-zA-Z0-9._-]/g, "_");

    return {
      url: `attachment://${safeFilename}`,

      files: [
        {
          attachment: product.image_blob,
          name: safeFilename,
        },
      ],
    };
  }

  /*
   * Legacy external URL fallback.
   */
  return {
    url:
      product.image_url ||
      "https://cdn.discordapp.com/embed/avatars/0.png",

    files: [],
  };
}

/* =========================================================
   CREATOR UI V4 — 2026 COMPONENTS
========================================================= */

const CREATOR_PAGE_SIZE = 3;

const CREATOR_CATEGORIES = [
  ["All", "all", "🛍️"],
  ["Fashion", "fashion", "👗"],
  ["Food", "food", "🍴"],
  ["Sports", "sports", "🏀"],
  ["Home", "home", "🏠"],
  ["Beauty", "beauty", "✨"],
  ["Tech", "tech", "💻"],
  ["Other", "other", "📦"],
];

function creatorSpacer(lines = 3) {
  return new TextDisplayBuilder().setContent(
    Array(lines).fill("\u200B").join("\n")
  );
}

function safeDealValue(value, fallback = "—") {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    String(value).trim().toLowerCase() === "null" ||
    String(value).trim().toLowerCase() === "undefined"
  ) {
    return fallback;
  }

  return String(value).trim();
}

function shorten(value, max = 240) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) {
    return "No description has been added yet.";
  }

  if (clean.length <= max) {
    return clean;
  }

  return clean.slice(0, max - 1).trimEnd() + "…";
}

function creatorCategorySelect(selected = "all") {
  return new StringSelectMenuBuilder()
    .setCustomId("deals:category")
    .setPlaceholder("Choose a category")
    .setMinValues(1)
    .setMaxValues(1)
    .setOptions(
      ...CREATOR_CATEGORIES.map(
        ([label, value, emoji]) => ({
          label,
          value,
          emoji,
          default: selected === value,
        })
      )
    );
}

function creatorProductSelect(products) {
  return new StringSelectMenuBuilder()
    .setCustomId("deals:view")
    .setPlaceholder("Select Product")
    .setMinValues(1)
    .setMaxValues(1)
    .setOptions(
      ...products.map((product) => ({
        label: product.name.slice(0, 100),
        description: [
          product.brand,
          `${product.commission} commission`,
          safeDealValue(product.shop_ads, "No Shop Ads"),
        ]
          .join(" • ")
          .slice(0, 100),
        value: String(product.id),
      }))
    );
}

function creatorProductLine(product) {
  const shopAds = safeDealValue(
    product.shop_ads,
    "—"
  );

  const secondary =
    shopAds !== "—"
      ? `💰 **${product.commission}**   🚀 **${shopAds} Ads**`
      : `💰 **${product.commission} Commission**`;

  return [
    `### ${product.name}`,
    `-# ${product.brand} • ${product.category}`,
    secondary,
  ].join("\n");
}


/* =========================================================
   HOME
========================================================= */

function buildHome() {
  const container =
    new ContainerBuilder()
      .setAccentColor(0xD6AF71)

      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            [
              "## Creator Deals",
              "-# Browse active brand partnerships, request samples, and manage your profile."
            ].join("\n")
          )
      )

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )

      .addActionRowComponents(
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                "deals:launch"
              )
              .setLabel(
                "Open Creator Deals"
              )
              .setStyle(
                ButtonStyle.Primary
              )
          )
      );

  return v2(
    [container],
    {
      attachments: []
    }
  );
}


/* =========================================================
   NEW DEAL ANNOUNCEMENT
========================================================= */

function buildDealAnnouncement(
  product
) {
  const media =
    productMedia(
      product,
      "announcement"
    );

  const commission =
    safeDealValue(
      product.commission,
      "—"
    );

  const shopAds =
    safeDealValue(
      product.shop_ads,
      "—"
    );

  const description =
    shorten(
      product.description,
      320
    );

  const shopAdsText =
    shopAds !== "—"
      ? `🚀 **${shopAds} Shop Ads**`
      : "🚀 **No Shop Ads**";

  const container =
    new ContainerBuilder()
      /*
       * UGC Network brand gold.
       */
      .setAccentColor(0xD6AF71)

      /*
       * Main product identity + thumbnail.
       */
      .addSectionComponents(
        new SectionBuilder()

          .addTextDisplayComponents(
            new TextDisplayBuilder()
              .setContent(
                [
                  "### ✦ NEW DEAL",
                  `## ${product.name}`,
                  `**${product.brand}**  •  ${product.category}`,
                  "",
                  description
                ].join("\n")
              )
          )

          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(
                media.url
              )
              .setDescription(
                product.name
              )
          )
      )

      /*
       * Deal economics / requirements.
       * Native Discord does not support a custom 4-column grid,
       * so this is the closest clean Components V2 equivalent.
       */
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            [
              `💰 **${commission} Commission**  •  ${shopAdsText}`,
              "📦 **Free Sample:** Auto-Approved  •  ⭐ **1 TikTok Shoppable Video**"
            ].join("\n")
          )
      )

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )

      /*
       * Keep green exclusively for the direct conversion CTA.
       */
      .addActionRowComponents(
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `quick-request:${product.id}`
              )
              .setLabel(
                "Quick Request"
              )
              .setEmoji("✅")
              .setStyle(
                ButtonStyle.Success
              )
          )
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            "-# Request directly here, or open Creator Deals below to browse every active partnership."
          )
      );

  return v2(
    [container],
    {
      files: media.files,
      attachments: []
    }
  );
}


/* =========================================================
   PRODUCT DETAILS
========================================================= */

function buildProductDetails(product) {
  const media = productMedia(
    product,
    "detail"
  );

  const commission = safeDealValue(
    product.commission,
    "—"
  );

  const shopAds = safeDealValue(
    product.shop_ads,
    "—"
  );

  const website = safeDealValue(
    product.brand_website,
    "—"
  );

  const container =
    new ContainerBuilder()
      .setAccentColor(0x5865f2)

      .addActionRowComponents(
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("deals:home")
            .setLabel("← Back to Deals")
            .setStyle(ButtonStyle.Secondary)
        )
      )

      .addSectionComponents(
        new SectionBuilder()

          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `## ${product.name}`,
                `**${product.brand}**`,
                `-# ${product.category}`,
                "",
                `💰 **Commission:** ${commission}`,
                `🚀 **Shop Ads:** ${shopAds}`,
                "📦 **Free Sample:** Auto-Approved",
              ].join("\n")
            )
          )

          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(media.url)
              .setDescription(product.name)
          )
      )

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "### Description",
            shorten(product.description, 320),
            "",
            "### ⭐ Creator Requirement",
            "1 TikTok Shoppable Video",
          ].join("\n")
        )
      )

      .addTextDisplayComponents(
        creatorSpacer(3)
      );

  const actions = [
    new ButtonBuilder()
      .setCustomId(
        `request:${product.id}`
      )
      .setLabel("Request Product")
      .setStyle(ButtonStyle.Primary),
  ];

  if (website !== "—") {
    actions.push(
      new ButtonBuilder()
        .setLabel("Brand Website")
        .setURL(website)
        .setStyle(ButtonStyle.Link)
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder()
      .addComponents(...actions)
  );

  return v2(
    [container],
    {
      files: media.files,
      attachments: [],
    }
  );
}


/* =========================================================
   CONFIRM
========================================================= */

function buildConfirm(product, handle) {
  const media = productMedia(
    product,
    "confirm"
  );

  const shopAds = safeDealValue(
    product.shop_ads,
    "—"
  );

  const container =
    new ContainerBuilder()
      .setAccentColor(0x5865f2)

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## Confirm Request",
            "-# Review the deal before submitting.",
          ].join("\n")
        )
      )

      .addSectionComponents(
        new SectionBuilder()

          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `### ${product.name}`,
                `**${product.brand}**`,
                "",
                `💰 **${product.commission} Commission**`,
                `🚀 **Shop Ads:** ${shopAds}`,
                "📦 **Free Sample:** Auto-Approved",
              ].join("\n")
            )
          )

          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(media.url)
              .setDescription(product.name)
          )
      )

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "### Request Information",
            `✓ TikTok: **${handle}**`,
            "⭐ 1 TikTok Shoppable Video",
            "",
            "-# By confirming, you agree to complete the listed creator requirement.",
          ].join("\n")
        )
      )

      .addTextDisplayComponents(
        creatorSpacer(4)
      )

      .addActionRowComponents(
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId(
              `product:${product.id}`
            )
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary),

          new ButtonBuilder()
            .setCustomId(
              `confirm:${product.id}`
            )
            .setLabel("Confirm Request")
            .setStyle(ButtonStyle.Success)
        )
      );

  return v2(
    [container],
    {
      files: media.files,
      attachments: [],
    }
  );
}


/* =========================================================
   SUBMITTED
========================================================= */

function buildSubmitted(product) {
  const media = productMedia(
    product,
    "submitted"
  );

  const container =
    new ContainerBuilder()
      .setAccentColor(0x23a559)

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "## ✅ Request Submitted",
            "-# Your product request has been received.",
          ].join("\n")
        )
      )

      .addSectionComponents(
        new SectionBuilder()

          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `### ${product.name}`,
                `**${product.brand}**`,
                "",
                "🟢 **Request sent successfully**",
              ].join("\n")
            )
          )

          .setThumbnailAccessory(
            new ThumbnailBuilder()
              .setURL(media.url)
              .setDescription(product.name)
          )
      )

      .addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(
            SeparatorSpacingSize.Small
          )
          .setDivider(true)
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            "### What happens next?",
            "1. The brand reviews your request.",
            "2. You'll be notified when a decision is made.",
            "3. If approved, the product will be sent to you.",
          ].join("\n")
        )
      )

      .addTextDisplayComponents(
        creatorSpacer(5)
      )

      .addActionRowComponents(
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("deals:home")
            .setLabel("Back to Deals")
            .setStyle(ButtonStyle.Primary)
        )
      );

  return v2(
    [container],
    {
      files: media.files,
      attachments: [],
    }
  );
}

/* =========================================================
   CREATOR TIKTOK MODAL
========================================================= */

function tikTokModal(productId) {
  return new ModalBuilder()

    .setCustomId(
      `tiktok:${productId}`
    )

    .setTitle(
      "Confirm Request"
    )

    .addLabelComponents(

      new LabelBuilder()
        .setLabel(
          "Enter your social username"
        )
        .setDescription(
          "TikTok username"
        )

        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("tiktok")
            .setStyle(
              TextInputStyle.Short
            )
            .setPlaceholder(
              "@yourusername"
            )
            .setRequired(true)
            .setMaxLength(40)
        )
    );
}

/* =========================================================
   QUICK REQUEST TIKTOK MODAL
========================================================= */

function quickRequestModal(
  productId
) {
  return new ModalBuilder()

    .setCustomId(
      `quick-request-submit:${productId}`
    )

    .setTitle(
      "Quick Request"
    )

    .addLabelComponents(
      new LabelBuilder()
        .setLabel(
          "TikTok username"
        )
        .setDescription(
          "Enter the TikTok username for this request"
        )

        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(
              "tiktok"
            )
            .setStyle(
              TextInputStyle.Short
            )
            .setPlaceholder(
              "@yourusername"
            )
            .setRequired(true)
            .setMaxLength(40)
        )
    );
}

/* =========================================================
   ADMIN — SELECTED PRODUCT
========================================================= */

function getAdminSelected() {
  const products =
    allProducts();

  if (!products.length) {
    return null;
  }

  let selected =
    productById(
      adminSelectedProductId
    );

  if (!selected) {
    selected = products[0];

    adminSelectedProductId =
      selected.id;
  }

  return selected;
}

/* =========================================================
   ADMIN — PERMANENT DASHBOARD
========================================================= */

function cleanAdminValue(value, fallback = "—") {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    String(value).trim().toLowerCase() === "null" ||
    String(value).trim().toLowerCase() === "undefined"
  ) {
    return fallback;
  }

  return String(value).trim();
}

function buildAdminDashboard() {
  const products = allProducts();
  const selected = getAdminSelected();

  const activeCount = products.filter(
    (product) => product.active
  ).length;

  const container =
    new ContainerBuilder()
      .setAccentColor(0x5865f2)

      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                "## Deals Admin",
                `**${activeCount} active** • ${products.length} total`,
              ].join("\n")
            )
          )
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId("admin:gear")
              .setEmoji("⚙️")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
      )

      .addActionRowComponents(
        new ActionRowBuilder().addComponents(

          new ButtonBuilder()
            .setCustomId("admin:add")
            .setLabel("＋ Add Product")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId("admin:refresh")
            .setLabel("Refresh Creator Deals")
            .setStyle(ButtonStyle.Primary)
        )
      );

  if (!products.length) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "No products yet. Click **Add Product**."
      )
    );

    return v2([container]);
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )

    .addActionRowComponents(
      new ActionRowBuilder().addComponents(

        new StringSelectMenuBuilder()
          .setCustomId("admin:select")
          .setPlaceholder("Choose product")

          .addOptions(
            products.slice(0, 25).map((product) => ({
              label: product.name.slice(0, 100),

              description: [
                product.brand,
                product.category,
                product.active ? "Active" : "Disabled",
              ]
                .join(" • ")
                .slice(0, 100),

              value: String(product.id),

              default:
                selected?.id === product.id,
            }))
          )
      )
    );

  if (!selected) {
    return v2([container]);
  }

  const shopAds =
    cleanAdminValue(
      selected.shop_ads,
      "—"
    );

  const freeSample =
    "Auto-Approved";

  const requirements =
    "1 TikTok Shoppable Video";

  const website =
    cleanAdminValue(
      selected.brand_website,
      "—"
    );

  const media =
    productMedia(
      selected,
      "admin"
    );

  const section =
    new SectionBuilder()

      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## ${selected.name}`,
            `**${selected.brand}** • ${selected.category}`,
            selected.active
              ? "🟢 **Active**"
              : "⚫ **Disabled**",
            "",
            `💰 **Commission:** ${selected.commission}`,
            `🚀 **Shop Ads:** ${shopAds}`,
            `📦 **Free Sample:** ${freeSample}`,
            `⭐ **Requirements:** ${requirements}`,
            `🌐 **Brand Website:** ${website}`,
          ].join("\n")
        )
      )

      .setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL(media.url)
          .setDescription(selected.name)
      );

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(SeparatorSpacingSize.Small)
        .setDivider(true)
    )

    .addSectionComponents(section)

    .addActionRowComponents(
      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId(
            `admin:edit-core:${selected.id}`
          )
          .setLabel("Product + Image")
          .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
          .setCustomId(
            `admin:edit-deal:${selected.id}`
          )
          .setLabel("Deal Info")
          .setStyle(ButtonStyle.Secondary)
      )
    )

    .addActionRowComponents(
      new ActionRowBuilder().addComponents(

        new ButtonBuilder()
          .setCustomId(
            `admin:toggle:${selected.id}`
          )
          .setLabel(
            selected.active
              ? "Disable"
              : "Enable"
          )
          .setStyle(
            selected.active
              ? ButtonStyle.Secondary
              : ButtonStyle.Success
          ),

        new ButtonBuilder()
          .setCustomId(
            `admin:delete:${selected.id}`
          )
          .setLabel("Delete")
          .setStyle(ButtonStyle.Danger)
      )
    );

  return v2(
    [container],
    {
      files: media.files,
    }
  );
}

/* =========================================================
   ADMIN — ADD PRODUCT STEP 1

   Includes native Discord image upload.
========================================================= */

function adminCategoryMenu(current = null) {
  const categories = [
    ["Fashion", "Fashion", "👗"],
    ["Food", "Food", "🍴"],
    ["Sports", "Sports", "🏀"],
    ["Home", "Home", "🏠"],
    ["Beauty", "Beauty", "✨"],
    ["Tech", "Tech", "💻"],
    ["Other", "Other", "📦"],
  ];

  return new StringSelectMenuBuilder()
    .setCustomId("category")
    .setPlaceholder("Choose product category")
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1)
    .setOptions(
      ...categories.map(
        ([label, value, emoji]) => ({
          label,
          value,
          emoji,
          default: current === value,
        })
      )
    );
}

function addProductModal() {
  return new ModalBuilder()
    .setCustomId("admin:add-core")
    .setTitle("Add Product")

    .addLabelComponents(

      new LabelBuilder()
        .setLabel("Product Name")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(
              "4 Pack Sampler"
            )
            .setRequired(true)
            .setMaxLength(100)
        ),

      new LabelBuilder()
        .setLabel("Brand")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("brand")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(
              "Brand Name"
            )
            .setRequired(true)
            .setMaxLength(100)
        ),

      new LabelBuilder()
        .setLabel("Category")
        .setDescription(
          "Where this product appears in Creator Deals"
        )
        .setStringSelectMenuComponent(
          adminCategoryMenu()
        ),

      new LabelBuilder()
        .setLabel("Product Image")
        .setDescription(
          "Upload the main creator-facing product image"
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("image")
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
        )
    );
}

/* =========================================================
   ADMIN — EDIT MAIN PRODUCT INFO
========================================================= */

function editCoreModal(product) {
  return new ModalBuilder()
    .setCustomId(
      `admin:edit-core-submit:${product.id}`
    )
    .setTitle("Edit Product")

    .addLabelComponents(

      new LabelBuilder()
        .setLabel("Product Name")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setStyle(TextInputStyle.Short)
            .setValue(product.name)
            .setRequired(true)
            .setMaxLength(100)
        ),

      new LabelBuilder()
        .setLabel("Brand")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("brand")
            .setStyle(TextInputStyle.Short)
            .setValue(product.brand)
            .setRequired(true)
            .setMaxLength(100)
        ),

      new LabelBuilder()
        .setLabel("Category")
        .setDescription(
          "Where this product appears in Creator Deals"
        )
        .setStringSelectMenuComponent(
          adminCategoryMenu(
            product.category
          )
        ),

      new LabelBuilder()
        .setLabel(
          "Replace Product Image"
        )
        .setDescription(
          "Optional — leave empty to keep the current image"
        )
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId("image")
            .setMinValues(0)
            .setMaxValues(1)
            .setRequired(false)
        )
    );
}

/* =========================================================
   ADMIN — DEAL INFO

   Exactly the fields requested.
========================================================= */

function dealInfoModal(product, mode = "edit") {
  const customId =
    mode === "add"
      ? `admin:add-deal:${product.id}`
      : `admin:edit-deal-submit:${product.id}`;

  const description =
    cleanAdminValue(
      product.description,
      ""
    );

  const commission =
    cleanAdminValue(
      product.commission,
      "10%"
    );

  const shopAds =
    cleanAdminValue(
      product.shop_ads,
      "—"
    );

  const website =
    cleanAdminValue(
      product.brand_website,
      ""
    );

  return new ModalBuilder()

    .setCustomId(customId)

    .setTitle(
      mode === "add"
        ? "Deal Info"
        : "Edit Deal Info"
    )

    .addLabelComponents(

      new LabelBuilder()
        .setLabel("Description")
        .setDescription(
          "Short creator-facing product description"
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("description")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(description)
            .setPlaceholder(
              "Describe the product and offer..."
            )
            .setRequired(false)
            .setMaxLength(1000)
        ),

      new LabelBuilder()
        .setLabel("💰 Commission")
        .setDescription(
          "Example: 20%"
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("commission")
            .setStyle(TextInputStyle.Short)
            .setValue(commission)
            .setPlaceholder("20%")
            .setRequired(true)
            .setMaxLength(30)
        ),

      new LabelBuilder()
        .setLabel("🚀 Shop Ads")
        .setDescription(
          "Example: +15% or —"
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("shop_ads")
            .setStyle(TextInputStyle.Short)
            .setValue(shopAds)
            .setPlaceholder("+15% or —")
            .setRequired(true)
            .setMaxLength(30)
        ),

      new LabelBuilder()
        .setLabel("🌐 Brand Website")
        .setDescription(
          "Example: https://brand.com"
        )
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("brand_website")
            .setStyle(TextInputStyle.Short)
            .setValue(website)
            .setPlaceholder(
              "https://brand.com"
            )
            .setRequired(false)
            .setMaxLength(500)
        )
    );
}

/* =========================================================
   IMAGE STORAGE

   Download the uploaded Discord image immediately and
   save the bytes directly into SQLite.
========================================================= */

async function attachmentToBuffer(
  attachment
) {
  const response =
    await fetch(
      attachment.url
    );

  if (!response.ok) {
    throw new Error(
      `Image download failed: ${response.status}`
    );
  }

  return Buffer.from(
    await response.arrayBuffer()
  );
}

/* =========================================================
   REQUEST DASHBOARD

   Private #deals dashboard only.
   Does NOT modify Creator Deals Activity launcher behavior.
========================================================= */

let lastRequestDashboardSignature =
  null;

let requestDashboardProductId =
  null;

let requestDashboardView =
  "pending";


function requestDashboardRows() {
  return db
    .prepare(`
      SELECT
        p.id AS product_id,
        p.name,
        p.brand,

        COUNT(r.id)
          AS total_requests,

        SUM(
          CASE
            WHEN r.status = 'sent'
              THEN 0
            ELSE 1
          END
        )
          AS new_requests,

        MAX(r.created_at)
          AS last_request_at,

        MAX(r.sent_at)
          AS last_sent_at

      FROM products p

      INNER JOIN product_requests r
        ON CAST(r.product_id AS TEXT) =
           CAST(p.id AS TEXT)

      GROUP BY
        p.id,
        p.name,
        p.brand

      ORDER BY
        datetime(last_request_at) DESC

      LIMIT 5
    `)
    .all();
}


function requestsForProduct(
  productId
) {
  return db
    .prepare(`
      SELECT
        id,
        discord_user_id,
        tiktok_handle,
        source,
        status,
        created_at,
        sent_at

      FROM product_requests

      WHERE
        CAST(product_id AS TEXT) = ?

      ORDER BY
        datetime(created_at) DESC,
        id DESC
    `)
    .all(
      String(productId)
    );
}


function buildRequestDetail(
  productId
) {
  const product =
    productById(productId);

  if (!product) {
    requestDashboardProductId =
      null;

    return buildRequestDashboard();
  }

  const allRequests =
    requestsForProduct(
      productId
    );

  const requests =
    requestDashboardView ===
      "sent"
        ? allRequests.filter(
            (row) =>
              row.status === "sent"
          )
        : allRequests.filter(
            (row) =>
              row.status !== "sent"
          );

  const newCount =
    allRequests.filter(
      (row) =>
        row.status !== "sent"
    ).length;

  const container =
    new ContainerBuilder()
      .setAccentColor(
        newCount > 0
          ? 0xF0B232
          : 0x23A559
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            [
              `## ${product.name}`,
              `**${product.brand}**`,
              "",
              `**${requests.length} ${requests.length === 1 ? "request" : "requests"}**`,
              requestDashboardView === "sent"
                ? "🟢 **Sent**"
                : (
                    newCount > 0
                      ? `🟡 **${newCount} new**`
                      : "🟢 **Sent**"
                  )
            ].join("\n")
          )
      )

      .addActionRowComponents(
        new ActionRowBuilder()
          .addComponents(

            new ButtonBuilder()
              .setCustomId(
                "requests:back"
              )
              .setLabel(
                "← Back"
              )
              .setStyle(
                ButtonStyle.Secondary
              ),

            new ButtonBuilder()
              .setCustomId(
                `requests:csv:${product.id}`
              )
              .setLabel(
                "Download TikTok CSV"
              )
              .setStyle(
                ButtonStyle.Primary
              ),

            new ButtonBuilder()
              .setCustomId(
                `requests:sent:${product.id}`
              )
              .setLabel(
                requestDashboardView === "sent" ||
                newCount === 0
                  ? "Sent ✓"
                  : "Mark Sent ✓"
              )
              .setStyle(
                requestDashboardView === "sent" ||
                newCount === 0
                  ? ButtonStyle.Secondary
                  : ButtonStyle.Success
              )
              .setDisabled(
                requestDashboardView === "sent" ||
                newCount === 0
              )
          )
      );

  if (!requests.length) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            requestDashboardView === "sent"
              ? "No sent requests for this product."
              : "No new requests for this product."
          )
      );

    return v2([
      container
    ]);
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setSpacing(
          SeparatorSpacingSize.Small
        )
        .setDivider(true)
    );

  /*
   * Keep Discord message compact.
   * CSV always contains ALL requests.
   */
  const visible =
    requests.slice(0, 20);

  visible.forEach(
    (row, index) => {
      if (index > 0) {
        container
          .addSeparatorComponents(
            new SeparatorBuilder()
              .setSpacing(
                SeparatorSpacingSize.Small
              )
              .setDivider(false)
          );
      }

      const unix =
        Math.floor(
          new Date(
            row.created_at + " UTC"
          ).getTime() / 1000
        );

      container
        .addTextDisplayComponents(
          new TextDisplayBuilder()
            .setContent(
              (() => {
                const lines = [
                  `### ${row.tiktok_handle}`,
                  `Discord: <@${row.discord_user_id}>`,
                  `Source: **${requestSourceLabel(row.source)}**`,
                  Number.isFinite(unix)
                    ? `Requested: <t:${unix}:f>`
                    : `Requested: ${row.created_at}`
                ];

                const selections =
                  requestVariants(
                    row.id
                  );

                if (
                  selections.length > 0
                ) {
                  lines.push(
                    "",
                    "**Selected Variants**",
                    ...selections.map(
                      variant =>
                        `• ${variant.variant_name_snapshot}`
                    )
                  );
                }

                return lines.join(
                  "\n"
                );
              })()
            )
        );
    }
  );

  if (
    requests.length >
    visible.length
  ) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            `-# Showing latest ${visible.length} of ${requests.length}.`
          )
      );
  }

  return v2([
    container
  ]);
}


function requestSurface() {
  if (
    requestDashboardProductId
  ) {
    return buildRequestDetail(
      requestDashboardProductId
    );
  }

  return buildRequestDashboard();
}


function buildRequestDashboard() {
  const rows =
    requestDashboardRows();

  const totalRequests =
    rows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.total_requests || 0
        ),
      0
    );

  const totalNew =
    rows.reduce(
      (sum, row) =>
        sum +
        Number(
          row.new_requests || 0
        ),
      0
    );

  const container =
    new ContainerBuilder()
      .setAccentColor(
        totalNew > 0
          ? 0xF0B232
          : 0x23A559
      )

      .addTextDisplayComponents(
        new TextDisplayBuilder()
          .setContent(
            [
              "## 📦 Creator Deal Requests",
              totalRequests
                ? `**${totalRequests} requests** • ${totalNew} new`
                : "No product requests yet.",
              "",
              "-# New requests automatically appear here. Mark a product sent after you send its current batch."
            ].join("\n")
          )
      );

  if (!rows.length) {
    return v2([
      container
    ]);
  }

  rows.forEach(
    (row, index) => {
      const newCount =
        Number(
          row.new_requests || 0
        );

      const total =
        Number(
          row.total_requests || 0
        );

      if (index > 0) {
        container
          .addSeparatorComponents(
            new SeparatorBuilder()
              .setSpacing(
                SeparatorSpacingSize.Small
              )
              .setDivider(true)
          );
      }

      container
        .addSectionComponents(
          new SectionBuilder()

            .addTextDisplayComponents(
              new TextDisplayBuilder()
                .setContent(
                  [
                    `### ${row.name}`,
                    `**${row.brand}** • ${total} ${total === 1 ? "request" : "requests"}`,
                    newCount > 0
                      ? `🟡 **${newCount} new ${newCount === 1 ? "request" : "requests"}**`
                      : "🟢 **Sent**"
                  ].join("\n")
                )
            )

            .setButtonAccessory(
              new ButtonBuilder()

                .setCustomId(
                  `requests:sent:${row.product_id}`
                )

                .setLabel(
                  newCount > 0
                    ? "Mark Sent ✓"
                    : "Sent ✓"
                )

                .setStyle(
                  newCount > 0
                    ? ButtonStyle.Success
                    : ButtonStyle.Secondary
                )

                .setDisabled(
                  newCount === 0
                )
            )
        )

        .addActionRowComponents(
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(
                  `requests:view:${row.product_id}`
                )
                .setLabel(
                  "View Requests"
                )
                .setStyle(
                  ButtonStyle.Primary
                ),

              new ButtonBuilder()
                .setCustomId(
                  `requests:view-sent:${row.product_id}`
                )
                .setLabel(
                  "View Sent Requests"
                )
                .setStyle(
                  ButtonStyle.Secondary
                )
            )
        );
    }
  );

  return v2([
    container
  ]);
}


function requestDashboardSignature() {
  return JSON.stringify(
    requestDashboardRows()
  );
}


async function refreshRequestDashboardIfChanged(
  force = false
) {
  const signature =
    requestDashboardSignature();

  if (
    !force &&
    signature ===
      lastRequestDashboardSignature
  ) {
    return;
  }

  lastRequestDashboardSignature =
    signature;

  await refreshAdmin();
}


/* =========================================================
   PERSISTENT CREATOR MESSAGE
========================================================= */

async function ensurePublicMessage() {
  const channel =
    await client.channels.fetch(
      process.env.MARKETPLACE_CHANNEL_ID
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "MARKETPLACE_CHANNEL_ID is invalid"
    );
  }

  const recent =
    await channel.messages.fetch({
      limit: 50,
    });

  const existing =
    recent.find(
      (message) =>
        message.author.id ===
          client.user.id &&
        messageHasCustomId(
          message,
          "deals:launch"
        )
    );

  if (existing) {
    publicMessage =
      await existing.edit(
        buildHome("all")
      );

    console.log(
      `✓ Refreshed Creator Deals: ${publicMessage.id}`
    );
  } else {
    publicMessage =
      await channel.send(
        buildHome("all")
      );

    console.log(
      `✓ Created Creator Deals: ${publicMessage.id}`
    );
  }

  return publicMessage;
}

/* =========================================================
   NEW DEAL ANNOUNCEMENTS
========================================================= */

function unannouncedActiveProducts() {
  return db.prepare(`
    SELECT *
    FROM products
    WHERE active = 1
    AND announcement_sent_at IS NULL
    ORDER BY
      datetime(created_at) ASC,
      rowid ASC
    LIMIT 10
  `).all();
}


async function repostPublicLauncher(
  channel
) {
  const previous =
    publicMessage;

  /*
   * Send the replacement first so the Activity launcher is
   * guaranteed to become the newest/bottom message before the
   * older launcher is removed.
   */
  const next =
    await channel.send(
      buildHome("all")
    );

  publicMessage =
    next;

  if (
    previous &&
    previous.id !== next.id
  ) {
    await previous
      .delete()
      .catch((error) => {
        if (
          error.code !== 10008
        ) {
          console.error(
            "Old Activity launcher delete failed:",
            error
          );
        }
      });
  }

  return next;
}


let announceNewDealsRunning = false;

async function announceNewDeals() {
  if (announceNewDealsRunning) {
    return;
  }

  announceNewDealsRunning = true;

  try {
    const products =
      unannouncedActiveProducts();

  if (!products.length) {
    return;
  }

  const channel =
    await client.channels.fetch(
      process.env.MARKETPLACE_CHANNEL_ID
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "MARKETPLACE_CHANNEL_ID is invalid"
    );
  }

  for (const product of products) {
    await channel.send(
      buildDealAnnouncement(
        product
      )
    );

    /*
     * Critical ordering:
     * announcement first, fresh Activity launcher second.
     */
    await repostPublicLauncher(
      channel
    );

    db.prepare(`
      UPDATE products
      SET announcement_sent_at =
        CURRENT_TIMESTAMP
      WHERE id = ?
      AND announcement_sent_at IS NULL
    `).run(
      String(product.id)
    );

    console.log(
      `✓ Announced new deal: ${product.name}`
    );
  }
  } finally {
    announceNewDealsRunning = false;
  }
}

/* =========================================================
   PERSISTENT ADMIN MESSAGE
========================================================= */

async function ensureAdminMessage() {
  const channel =
    await client.channels.fetch(
      process.env
        .MARKETPLACE_ADMIN_CHANNEL_ID
    );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      "MARKETPLACE_ADMIN_CHANNEL_ID is invalid"
    );
  }

  const recent =
    await channel.messages.fetch({
      limit: 50,
    });

  const existing =
    recent.find(
      (message) =>
        message.author.id ===
          client.user.id &&
        message.flags.has(
          MessageFlags.IsComponentsV2
        )
    );

  if (existing) {
    adminMessage =
      await existing.edit({
        ...requestSurface(),

        /*
         * Remove previous dashboard image attachments
         * before adding the selected product's current image.
         */
        attachments: [],
      });

    console.log(
      `✓ Refreshed Deals Admin: ${adminMessage.id}`
    );
  } else {
    adminMessage =
      await channel.send(
        requestSurface()
      );

    console.log(
      `✓ Created Deals Admin: ${adminMessage.id}`
    );
  }

  return adminMessage;
}

/* =========================================================
   REFRESH
========================================================= */

async function refreshPublic() {
  if (!publicMessage) {
    await ensurePublicMessage();
    return;
  }

  try {
    publicMessage =
      await publicMessage.edit(
        buildHome("all")
      );
  } catch (error) {
    if (error.code === 10008) {
      console.log(
        "Creator Deals message was deleted — recreating it."
      );

      publicMessage = null;
      await ensurePublicMessage();
      return;
    }

    throw error;
  }
}

async function refreshAdmin() {
  if (!adminMessage) {
    await ensureAdminMessage();
    return;
  }

  adminMessage =
    await adminMessage.edit({
      ...requestSurface(),
      attachments: [],
    });
}

function adminOnly(interaction) {
  return (
    interaction.channelId ===
    process.env
      .MARKETPLACE_ADMIN_CHANNEL_ID
  );
}

/* =========================================================
   INTERACTIONS
========================================================= */

client.on(
  "interactionCreate",

  async (interaction) => {

  if (interaction.isButton()) {
    console.log(
      "BUTTON CLICK:",
      interaction.customId,
      "channel:",
      interaction.channelId,
      "expected admin:",
      process.env.MARKETPLACE_ADMIN_CHANNEL_ID
    );
  }

  /*
   * FAST PATH: Discord Activity launch
   *
   * LAUNCH_ACTIVITY is the interaction response itself, so this
   * must happen immediately before any DB/API/admin work.
   */
  if (
    interaction.isButton() &&
    interaction.customId === "deals:launch"
  ) {
    try {
      await interaction.launchActivity();
    } catch (error) {
      console.error(
        "Creator Deals Activity launch failed:",
        error
      );
    }

    return;
  }


    try {

      /* ===================================================
         REQUEST DASHBOARD — VIEW PRODUCT REQUESTS
      =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "requests:view:"
        )
      ) {
        if (
          !adminOnly(interaction)
        ) {
          return;
        }

        await interaction.deferUpdate();

        requestDashboardProductId =
          interaction.customId
            .slice(
              "requests:view:".length
            );

        requestDashboardView =
          "pending";

        await refreshAdmin();

        return;
      }


      /* ===================================================
         REQUEST DASHBOARD — VIEW SENT REQUESTS
      =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "requests:view-sent:"
        )
      ) {
        if (
          !adminOnly(interaction)
        ) {
          return;
        }

        await interaction.deferUpdate();

        requestDashboardProductId =
          interaction.customId
            .slice(
              "requests:view-sent:".length
            );

        requestDashboardView =
          "sent";

        await refreshAdmin();

        return;
      }


      /* ===================================================
         REQUEST DASHBOARD — BACK
      =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "requests:back"
      ) {
        if (
          !adminOnly(interaction)
        ) {
          return;
        }

        await interaction.deferUpdate();

        requestDashboardProductId =
          null;

        requestDashboardView =
          "pending";

        await refreshAdmin();

        return;
      }


      /* ===================================================
         REQUEST DASHBOARD — DOWNLOAD TIKTOK CSV
      =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "requests:csv:"
        )
      ) {
        if (
          !adminOnly(interaction)
        ) {
          return;
        }

        const productId =
          interaction.customId
            .slice(
              "requests:csv:".length
            );

        const product =
          productById(
            productId
          );

        const rows =
          requestsForProduct(
            productId
          );

        const csv =
          rows
            .map(
              (row) =>
                String(
                  row.tiktok_handle || ""
                ).trim()
            )
            .filter(Boolean)
            .join("\n") +
          (rows.length ? "\n" : "");

        const filename =
          `${String(
            product?.id ||
            "requests"
          )}-tiktok-handles.csv`;

        await interaction.reply({
          content:
            `TikTok handles for **${product?.name || "product"}**`,

          files: [
            {
              attachment:
                Buffer.from(
                  csv,
                  "utf8"
                ),

              name:
                filename
            }
          ],

          flags:
            MessageFlags.Ephemeral
        });

        return;
      }


      /* ===================================================
         REQUEST DASHBOARD — MARK CURRENT BATCH SENT
      =================================================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "requests:sent:"
        )
      ) {
        if (
          !adminOnly(interaction)
        ) {
          return;
        }

        await interaction.deferUpdate();

        const productId =
          interaction.customId
            .slice(
              "requests:sent:".length
            );

        db.prepare(`
          UPDATE product_requests

          SET
            status = 'sent',
            sent_at = CURRENT_TIMESTAMP

          WHERE
            CAST(product_id AS TEXT) = ?

          AND
            status != 'sent'
        `).run(
          String(productId)
        );

        await refreshRequestDashboardIfChanged(
          true
        );

        return;
      }


      /* ===================================================
         ADMIN PRODUCT SELECT
      =================================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "admin:select"
      ) {
        if (!adminOnly(interaction)) {
          return;
        }

        adminSelectedProductId =
          String(
            interaction.values[0]
          );

        await interaction.deferUpdate();

        await refreshAdmin();

        return;
      }

      /* ===================================================
         BUTTONS
      =================================================== */

      /* CREATOR DEALS SELECTS */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "deals:category"
      ) {
        const category =
          interaction.values[0];

        await interaction.update(
          buildHome(category, 0)
        );

        return;
      }

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "deals:view"
      ) {
        const product =
          productById(
            interaction.values[0]
          );

        if (!product) {
          await interaction.reply({
            content:
              "That product is no longer available.",
            flags:
              MessageFlags.Ephemeral,
          });

          return;
        }

        await interaction.update(
          buildProductDetails(product)
        );

        return;
      }

      if (interaction.isButton()) {
        const id =
          interaction.customId;

        /* =================================================
           QUICK REQUEST
        ================================================= */

        if (
          id.startsWith(
            "quick-request:"
          )
        ) {
          const productId =
            String(
              id.slice(
                "quick-request:".length
              )
            );

          const product =
            productById(
              productId
            );

          if (
            !product ||
            !product.active
          ) {
            await interaction.reply({
              content:
                "That deal is no longer available.",
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          /*
           * Always ask for TikTok on Quick Request, even if the
           * creator already has one saved in their profile.
           */
          await interaction.showModal(
            quickRequestModal(
              productId
            )
          );

          return;
        }

        


        if (
          id.startsWith(
            "deals:page:"
          )
        ) {
          const parts =
            id.split(":");

          const category =
            parts[2] || "all";

          const page =
            Number(parts[3] || 0);

          await interaction.update(
            buildHome(
              category,
              page
            )
          );

          return;
        }


        /* =================================================
           ADMIN BUTTONS
        ================================================= */

        if (
          id.startsWith("admin:")
        ) {
          if (
            !adminOnly(interaction)
          ) {
            await interaction.reply({
              content:
                "Admin controls are only available in the admin channel.",

              flags:
                MessageFlags.Ephemeral,
            });

            return;
          }

          /* ADD PRODUCT */

          if (id === "admin:add") {
            await interaction.showModal(
              addProductModal()
            );

            return;
          }

          /* REFRESH CREATOR DEALS */

          if (
            id ===
            "admin:refresh"
          ) {
            await interaction.deferReply({
              flags:
                MessageFlags.Ephemeral,
            });

            await refreshPublic();

            await interaction.editReply(
              "✓ Creator Deals refreshed."
            );

            return;
          }

          /* ADD STEP 2 */

          if (
            id.startsWith(
              "admin:add-details:"
            )
          ) {
            const product =
              productById(
                id.split(":")[2]
              );

            if (product) {
              await interaction.showModal(
                dealInfoModal(
                  product,
                  "add"
                )
              );
            }

            return;
          }


          /* EDIT PRODUCT / IMAGE */

          if (
            id.startsWith(
              "admin:edit-core:"
            )
          ) {
            const product =
              productById(
                id.split(":")[2]
              );

            if (product) {
              await interaction.showModal(
                editCoreModal(product)
              );
            }

            return;
          }

          /* EDIT DEAL INFO */

          if (
            id.startsWith(
              "admin:edit-deal:"
            )
          ) {
            const product =
              productById(
                id.split(":")[2]
              );

            if (product) {
              await interaction.showModal(
                dealInfoModal(
                  product,
                  "edit"
                )
              );
            }

            return;
          }

          /* ENABLE / DISABLE */

          if (
            id.startsWith(
              "admin:toggle:"
            )
          ) {
            const productId =
              String(
                id.split(":")[2]
              );

            db.prepare(`
              UPDATE products

              SET
                active =
                  CASE active
                    WHEN 1 THEN 0
                    ELSE 1
                  END,

                updated_at =
                  CURRENT_TIMESTAMP

              WHERE id = ?
            `).run(productId);

            await interaction.deferUpdate();

            await Promise.all([
              refreshAdmin(),
              refreshPublic(),
            ]);

            return;
          }

          /* DELETE CONFIRMED */

          if (
            id.startsWith(
              "admin:delete-confirm:"
            )
          ) {
            const productId =
              String(
                id.split(":")[2]
              );

            db.prepare(`
              DELETE FROM products
              WHERE id = ?
            `).run(productId);

            if (
              adminSelectedProductId ===
              productId
            ) {
              adminSelectedProductId =
                null;
            }

            await interaction.update({
              content:
                "✓ Product deleted.",

              components: [],
            });

            await Promise.all([
              refreshAdmin(),
              refreshPublic(),
            ]);

            return;
          }

          /* DELETE REQUEST */

          if (
            id.startsWith(
              "admin:delete:"
            )
          ) {
            const productId =
              String(
                id.split(":")[2]
              );

            const product =
              productById(productId);

            if (!product) {
              return;
            }

            await interaction.reply({
              content:
                `Delete **${product.name}**? This cannot be undone.`,

              flags:
                MessageFlags.Ephemeral,

              components: [
                new ActionRowBuilder()
                  .addComponents(

                    new ButtonBuilder()
                      .setCustomId(
                        `admin:delete-confirm:${productId}`
                      )
                      .setLabel(
                        "Delete Product"
                      )
                      .setStyle(
                        ButtonStyle.Danger
                      ),

                    new ButtonBuilder()
                      .setCustomId(
                        "admin:delete-cancel"
                      )
                      .setLabel("Cancel")
                      .setStyle(
                        ButtonStyle.Secondary
                      )
                  ),
              ],
            });

            return;
          }

          /* DELETE CANCEL */

          if (
            id ===
            "admin:delete-cancel"
          ) {
            await interaction.update({
              content:
                "Cancelled.",

              components: [],
            });

            return;
          }
        }

        /* =================================================
           CREATOR CATEGORY

           Public persistent message is NEVER changed by a
           creator. Filters open privately.
        ================================================= */

        if (
          id.startsWith(
            "category:"
          )
        ) {
          const category =
            id.split(":")[1];

          await interaction.update(
            buildHome(category)
          );

          return;
        }

        /* =================================================
           PRODUCT VIEW

           Private / ephemeral.
        ================================================= */

        if (
          id.startsWith(
            "product:"
          )
        ) {
          const product =
            productById(
              id.split(":")[1]
            );

          if (!product) {
            return;
          }

          await interaction.update(
            buildProductDetails(product)
          );

          return;
        }

        /* =================================================
           EPHEMERAL HOME
        ================================================= */

        if (
          id ===
          "deals:home"
        ) {
          await interaction.update(
            buildHome("all")
          );

          return;
        }

        /* =================================================
           REQUEST PRODUCT
        ================================================= */

        if (
          id.startsWith(
            "request:"
          )
        ) {
          const productId =
            id.split(":")[1];

          const product =
            productById(
              productId
            );

          if (!product) {
            return;
          }

          const handle =
            getTikTok(
              interaction.user.id
            );

          if (!handle) {
            await interaction.showModal(
              tikTokModal(
                productId
              )
            );

            return;
          }

          await interaction.update({
            ...buildConfirm(
              product,
              handle
            ),

            attachments: [],
          });

          return;
        }

        /* =================================================
           CONFIRM PRODUCT REQUEST
        ================================================= */

        if (
          id.startsWith(
            "confirm:"
          )
        ) {
          const productId =
            String(
              id.split(":")[1]
            );

          const product =
            productById(
              productId
            );

          if (!product) {
            return;
          }

          const handle =
            getTikTok(
              interaction.user.id
            );

          const requestResult =
            db.prepare(`
              INSERT INTO product_requests (
                discord_user_id,
                product_id,
                tiktok_handle
              )
              VALUES (?, ?, ?)
            `).run(
              interaction.user.id,
              productId,
              handle || ""
            );

          if (
            productHasSelectableVariants(
              product
            )
          ) {
            saveDefaultRequestVariant(
              requestResult.lastInsertRowid,
              productId
            );
          }

          void sendAdminRequestPing(
            productId
          );

          await interaction.update({
            ...buildSubmitted(
              product
            ),

            attachments: [],
          });

          return;
        }
      }

      /* ===================================================
         MODALS
      =================================================== */

      if (
        interaction.isModalSubmit()
      ) {
        const id =
          interaction.customId;

        /* =================================================
           QUICK REQUEST SUBMIT
        ================================================= */

        if (
          id.startsWith(
            "quick-request-submit:"
          )
        ) {
          const productId =
            String(
              id.slice(
                "quick-request-submit:".length
              )
            );

          const product =
            productById(
              productId
            );

          if (
            !product ||
            !product.active
          ) {
            await interaction.reply({
              content:
                "That deal is no longer available.",
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          let handle =
            interaction.fields
              .getTextInputValue(
                "tiktok"
              )
              .trim();

          if (
            !handle.startsWith("@")
          ) {
            handle =
              `@${handle}`;
          }

          /*
           * Same permanent identity/profile used by the Activity.
           */
          saveTikTok(
            interaction.user.id,
            handle
          );

          /*
           * Same duplicate universe as Activity:
           * exact discord_user_id + product_id pair.
           */
          if (
            hasRequestedProduct(
              interaction.user.id,
              productId
            )
          ) {
            await interaction.reply({
              content:
                "You already requested this product.",
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          const requestResult =
            insertProductRequest(
              interaction.user.id,
              productId,
              handle,
              "quick_request"
            );

          if (
            productHasSelectableVariants(
              product
            )
          ) {
            saveDefaultRequestVariant(
              requestResult.lastInsertRowid,
              productId
            );
          }

          void sendAdminRequestPing(
            productId
          );

          await refreshRequestDashboardIfChanged(
            true
          );

          await interaction.reply({
            content:
              `✓ Quick Request submitted for **${product.name}**.`,
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }



        /* =================================================
           ADMIN ADD PRODUCT — STEP 1
        ================================================= */

        if (
          id ===
          "admin:add-core"
        ) {
          if (
            !adminOnly(interaction)
          ) {
            return;
          }

          const uploadedFiles =
            interaction.fields
              .getUploadedFiles(
                "image",
                true
              );

          const attachment =
            uploadedFiles.first();

          const imageBlob =
            await attachmentToBuffer(
              attachment
            );

          const productName =
            interaction.fields
              .getTextInputValue("name")
              .trim();

          const productId =
            makeProductId(productName);

          db.prepare(`
              INSERT INTO products (
                id,
                name,
                brand,
                category,
                commission,

                shop_ads,
                free_sample,
                requirements,
                brand_website,

                image_blob,
                image_filename,
                image_mime,

                active
              )

              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,

                ?,
                ?,
                ?,
                ?,

                ?,
                ?,
                ?,

                0
              )
            `).run(

              productId,

              productName,

              interaction.fields
                .getTextInputValue(
                  "brand"
                )
                .trim(),

              interaction.fields
                .getStringSelectValues(
                  "category"
                )[0],

              interaction.fields
                .getTextInputValue(
                  "commission"
                )
                .trim(),

              "—",

              "Auto-Approved",

              "1 TikTok Shoppable Video",

              "",

              imageBlob,

              attachment.name ||
                "product-image",

              attachment.contentType ||
                "image/*"
            );

          adminSelectedProductId =
            productId;

          await interaction.reply({
            content:
              "✓ Image and basic product info saved. Finish the deal details to publish it.",

            flags:
              MessageFlags.Ephemeral,

            components: [
              new ActionRowBuilder()
                .addComponents(

                  new ButtonBuilder()
                    .setCustomId(
                      `admin:add-details:${productId}`
                    )
                    .setLabel(
                      "Continue: Deal Details"
                    )
                    .setStyle(
                      ButtonStyle.Primary
                    )
                ),
            ],
          });

          await refreshAdmin();

          return;
        }

        /* =================================================
           ADD / EDIT DEAL INFO
        ================================================= */

        if (
          id.startsWith(
            "admin:add-deal:"
          ) ||
          id.startsWith(
            "admin:edit-deal-submit:"
          )
        ) {
          if (!adminOnly(interaction)) {
            return;
          }

          const productId =
            String(
              id.split(":").pop()
            );

          const isAdd =
            id.startsWith(
              "admin:add-deal:"
            );

          let website =
            interaction.fields
              .getTextInputValue(
                "brand_website"
              )
              .trim();

          if (
            website &&
            !/^https?:\/\//i.test(
              website
            )
          ) {
            website =
              `https://${website}`;
          }

          db.prepare(`
            UPDATE products

            SET
              description = ?,
              commission = ?,
              shop_ads = ?,
              brand_website = ?,

              free_sample = 'Auto-Approved',
              requirements = '1 TikTok Shoppable Video',

              active =
                CASE
                  WHEN ? = 1 THEN 1
                  ELSE active
                END,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = ?
          `).run(

            interaction.fields
              .getTextInputValue(
                "description"
              )
              .trim(),

            interaction.fields
              .getTextInputValue(
                "commission"
              )
              .trim(),

            interaction.fields
              .getTextInputValue(
                "shop_ads"
              )
              .trim(),

            website,

            isAdd ? 1 : 0,

            productId
          );

          await interaction.reply({
            content:
              isAdd
                ? "✓ Product published to Creator Deals."
                : "✓ Deal info updated.",

            flags:
              MessageFlags.Ephemeral,
          });

          await Promise.all([
            refreshAdmin(),
            refreshPublic(),
          ]);

          return;
        }

        /* =================================================
           EDIT PRODUCT + OPTIONAL NEW IMAGE
        ================================================= */

        if (
          id.startsWith(
            "admin:edit-core-submit:"
          )
        ) {
          if (
            !adminOnly(interaction)
          ) {
            return;
          }

          const productId =
            String(
              id.split(":").pop()
            );

          const uploads =
            interaction.fields
              .getUploadedFiles(
                "image",
                false
              );

          const attachment =
            uploads?.first?.() ||
            null;

          if (attachment) {
            const imageBlob =
              await attachmentToBuffer(
                attachment
              );

            db.prepare(`
              UPDATE products

              SET
                name = ?,
                brand = ?,
                category = ?,

                image_blob = ?,
                image_filename = ?,
                image_mime = ?,
                image_url = NULL,

                updated_at =
                  CURRENT_TIMESTAMP

              WHERE id = ?
            `).run(

              interaction.fields
                .getTextInputValue(
                  "name"
                )
                .trim(),

              interaction.fields
                .getTextInputValue(
                  "brand"
                )
                .trim(),

              interaction.fields
                .getStringSelectValues(
                  "category"
                )[0],

              imageBlob,

              attachment.name ||
                "product-image",

              attachment.contentType ||
                "image/*",

              productId
            );
          } else {
            db.prepare(`
              UPDATE products

              SET
                name = ?,
                brand = ?,
                category = ?,
                updated_at =
                  CURRENT_TIMESTAMP

              WHERE id = ?
            `).run(

              interaction.fields
                .getTextInputValue(
                  "name"
                )
                .trim(),

              interaction.fields
                .getTextInputValue(
                  "brand"
                )
                .trim(),

              interaction.fields
                .getStringSelectValues(
                  "category"
                )[0],

              productId
            );
          }

          await interaction.reply({
            content:
              "✓ Product and image updated.",

            flags:
              MessageFlags.Ephemeral,
          });

          await Promise.all([
            refreshAdmin(),
            refreshPublic(),
          ]);

          return;
        }

        /* =================================================
           CREATOR TIKTOK
        ================================================= */

        if (
          id.startsWith(
            "tiktok:"
          )
        ) {
          const productId =
            String(
              id.split(":")[1]
            );

          const product =
            productById(
              productId
            );

          if (!product) {
            return;
          }

          let handle =
            interaction.fields
              .getTextInputValue(
                "tiktok"
              )
              .trim();

          if (
            !handle.startsWith("@")
          ) {
            handle =
              `@${handle}`;
          }

          saveTikTok(
            interaction.user.id,
            handle
          );

          if (
            interaction.isFromMessage()
          ) {
            await interaction.update({
              ...buildConfirm(
                product,
                handle
              ),

              attachments: [],
            });
          } else {
            await interaction.reply({
              ...buildConfirm(
                product,
                handle
              ),

              flags: [
                MessageFlags.IsComponentsV2,
                MessageFlags.Ephemeral,
              ],
            });
          }

          return;
        }
      }
    } catch (error) {
      console.error(error);

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction
          .reply({
            content:
              `Something went wrong: ${error.message}`,

            flags:
              MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  }
);

/* =========================================================
   START
========================================================= */

client.once(
  "clientReady",

  async () => {
    console.log(
      `✓ Logged in as ${client.user.tag}`
    );

    if (
      !process.env.MARKETPLACE_CHANNEL_ID
    ) {
      throw new Error(
        "MARKETPLACE_CHANNEL_ID is missing from .env"
      );
    }

    if (
      !process.env
        .MARKETPLACE_ADMIN_CHANNEL_ID
    ) {
      throw new Error(
        "MARKETPLACE_ADMIN_CHANNEL_ID is missing from .env"
      );
    }

    await ensurePublicMessage();

    await ensureAdminMessage();

    lastRequestDashboardSignature =
      requestDashboardSignature();

    await announceNewDeals();

    /*
     * Activity requests are written by the API process.
     * Check SQLite every 5 seconds and update Discord only
     * when something actually changed.
     */
    setInterval(
      () => {
        refreshRequestDashboardIfChanged()
          .catch((error) => {
            console.error(
              "Request dashboard refresh failed:",
              error
            );
          });
      },
      5000
    );
    /*
     * Product creation can happen through more than one admin
     * surface. Watch the shared DB and announce only newly active
     * products that have never been announced.
     */
    setInterval(
      () => {
        announceNewDeals()
          .catch((error) => {
            console.error(
              "New deal announcement failed:",
              error
            );
          });
      },
      5000
    );
  }
);

client.login(
  process.env.DISCORD_TOKEN
);
