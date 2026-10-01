import express from "express";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import multer from "multer";
import path from "path";

import {
  S3Client,
  GetObjectCommand
} from "@aws-sdk/client-s3";

import {
  getSignedUrl
} from "@aws-sdk/s3-request-presigner";
import {
  fileURLToPath
} from "url";

dotenv.config({
  path:
    path.resolve(
      process.cwd(),
      "../.env"
    )
});

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(__filename);

const DB_PATH =
  path.resolve(
    __dirname,
    "../creator-deals.db"
  );

const db =
  new Database(DB_PATH);

db.pragma(
  "journal_mode = WAL"
);

const app =
  express();

const PORT = 3001;

const R2_BUCKET =
  process.env.R2_BUCKET;

const r2 =
  new S3Client({
    region: "auto",

    endpoint:
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,

    credentials: {
      accessKeyId:
        process.env.R2_ACCESS_KEY_ID,

      secretAccessKey:
        process.env.R2_SECRET_ACCESS_KEY
    }
  });

const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        80 * 1024 * 1024
    }
  });

app.use(
  express.json({
    limit: "2mb"
  })
);


/* =========================================================
   DATABASE MIGRATIONS
========================================================= */

function columns(table) {
  return new Set(
    db.prepare(
      `PRAGMA table_info(${table})`
    )
      .all()
      .map(row => row.name)
  );
}


function addColumn(
  table,
  name,
  definition
) {
  const cols =
    columns(table);

  if (
    !cols.has(name)
  ) {
    db.exec(
      `ALTER TABLE ${table}
       ADD COLUMN ${definition}`
    );

    console.log(
      `✓ Added ${table}.${name}`
    );
  }
}


addColumn(
  "products",
  "sort_order",
  "sort_order INTEGER NOT NULL DEFAULT 0"
);

addColumn(
  "products",
  "category_sort_order",
  "category_sort_order INTEGER NOT NULL DEFAULT 0"
);

addColumn(
  "products",
  "image_key",
  "image_key TEXT"
);

addColumn(
  "products",
  "variants_enabled",
  "variants_enabled INTEGER NOT NULL DEFAULT 0"
);

addColumn(
  "products",
  "variant_selection_limit",
  "variant_selection_limit INTEGER NOT NULL DEFAULT 1"
);


db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.prepare(`
  INSERT OR IGNORE INTO app_settings (
    key,
    value
  )
  VALUES (?, ?)
`).run(
  "category_order",
  JSON.stringify([
    "All",
    "Fashion",
    "Food",
    "Sports",
    "Home",
    "Beauty",
    "Tech",
    "Pets",
    "Other"
  ])
);


addColumn(
  "products",
  "description",
  "description TEXT NOT NULL DEFAULT ''"
);

addColumn(
  "products",
  "image_blob",
  "image_blob BLOB"
);

addColumn(
  "products",
  "image_filename",
  "image_filename TEXT"
);

addColumn(
  "products",
  "image_mime",
  "image_mime TEXT"
);

addColumn(
  "products",
  "image_url",
  "image_url TEXT"
);

addColumn(
  "creator_profiles",
  "instagram_handle",
  "instagram_handle TEXT"
);

addColumn(
  "creator_profiles",
  "email",
  "email TEXT"
);

addColumn(
  "creator_profiles",
  "address",
  "address TEXT"
);

addColumn(
  "creator_profiles",
  "city",
  "city TEXT"
);

addColumn(
  "creator_profiles",
  "state",
  "state TEXT"
);

addColumn(
  "creator_profiles",
  "zip_code",
  "zip_code TEXT"
);

addColumn(
  "creator_profiles",
  "shirt_size",
  "shirt_size TEXT"
);

addColumn(
  "creator_profiles",
  "shoe_size",
  "shoe_size TEXT"
);


addColumn(
  "product_requests",
  "source",
  "source TEXT NOT NULL DEFAULT 'activity'"
);

db.exec(`
  CREATE TABLE IF NOT EXISTS product_videos (
    product_id TEXT NOT NULL,
    slot INTEGER NOT NULL,
    video_blob BLOB NOT NULL,
    video_filename TEXT,
    video_mime TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, slot)
  )
`);

addColumn(
  "product_videos",
  "video_key",
  "video_key TEXT"
);


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

addColumn(
  "product_variants",
  "image_key",
  "image_key TEXT"
);

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



/* =========================================================
   HELPERS
========================================================= */

function normalizeProduct(
  row
) {
  if (!row) return null;

  /*
   * Never serialize raw image bytes into product JSON.
   * Images are served separately by /api/products/:id/image.
   */
  const {
    image_blob,
    ...safeRow
  } = row;

  const creatorVideos =
    db.prepare(
      `SELECT
         slot,
         video_filename,
         video_mime
       FROM product_videos
       WHERE product_id = ?
       ORDER BY slot ASC`
    )
      .all(String(row.id))
      .map(video => ({
        slot:
          Number(video.slot),

        filename:
          video.video_filename || "",

        mime:
          video.video_mime ||
          "video/mp4"
      }));


  const variants =
    db.prepare(
      `SELECT
         id,
         position,
         name,
         external_product_id,
         image_filename,
         image_mime
       FROM product_variants
       WHERE product_id = ?
       ORDER BY
         position ASC,
         id ASC`
    )
      .all(String(row.id))
      .map(variant => ({
        id:
          Number(variant.id),

        position:
          Number(variant.position),

        name:
          variant.name || "",

        external_product_id:
          variant.external_product_id || "",

        image_filename:
          variant.image_filename || "",

        image_mime:
          variant.image_mime ||
          "image/jpeg"
      }));

  return {
    ...safeRow,

    creator_videos:
      creatorVideos,

    variants:
      variants,

    variants_enabled:
      Boolean(
        row.variants_enabled
      ),

    variant_selection_limit:
      Math.max(
        1,
        Number(
          row.variant_selection_limit
        ) || 1
      ),

    active:
      Boolean(row.active),

    shop_ads:
      row.shop_ads &&
      row.shop_ads !== "null" &&
      row.shop_ads !== "undefined"
        ? row.shop_ads
        : "—",

    free_sample:
      row.free_sample ||
      "Auto-Approved",

    requirements:
      row.requirements ||
      "1 TikTok Shoppable Video"
  };
}


function productById(id) {
  return normalizeProduct(
    db.prepare(
      `SELECT *
       FROM products
       WHERE id = ?`
    ).get(String(id))
  );
}


function parseAdminVariants(
  body
) {
  let raw = [];

  try {
    raw =
      JSON.parse(
        body.variants_json ||
        "[]"
      );
  } catch {
    raw = [];
  }

  if (!Array.isArray(raw)) {
    raw = [];
  }

  return raw
    .slice(0, 12)
    .map((variant, index) => ({
      id:
        variant?.id
          ? Number(variant.id)
          : null,

      position:
        index + 1,

      name:
        String(
          variant?.name || ""
        ).trim(),

      external_product_id:
        String(
          variant?.external_product_id ||
          ""
        ).trim()
    }))
    .filter(
      variant =>
        variant.name
    );
}


function validateSelectedVariants(
  product,
  selectedVariantIds
) {
  const enabled =
    Boolean(
      product?.variants_enabled
    );

  const available =
    Array.isArray(
      product?.variants
    )
      ? product.variants
      : [];

  /*
   * Normal products must preserve
   * their existing request behavior.
   */
  if (
    !enabled ||
    available.length === 0
  ) {
    return [];
  }

  const raw =
    Array.isArray(
      selectedVariantIds
    )
      ? selectedVariantIds
      : [];

  const ids =
    raw.map(value =>
      Number(value)
    );

  if (
    ids.some(
      id =>
        !Number.isInteger(id) ||
        id <= 0
    )
  ) {
    const error =
      new Error(
        "Invalid product selection"
      );

    error.statusCode = 400;

    throw error;
  }

  const uniqueIds =
    [...new Set(ids)];

  if (
    uniqueIds.length !==
    ids.length
  ) {
    const error =
      new Error(
        "Duplicate product selection"
      );

    error.statusCode = 400;

    throw error;
  }

  const limit =
    Math.max(
      1,
      Math.min(
        available.length,
        Number(
          product
            .variant_selection_limit
        ) || 1
      )
    );

  if (
    uniqueIds.length < 1
  ) {
    const error =
      new Error(
        "Select at least one product"
      );

    error.statusCode = 400;

    throw error;
  }

  if (
    uniqueIds.length > limit
  ) {
    const error =
      new Error(
        `Select up to ${limit} products`
      );

    error.statusCode = 400;

    throw error;
  }

  const selected =
    uniqueIds.map(id =>
      available.find(
        variant =>
          Number(variant.id) === id
      )
    );

  if (
    selected.some(
      variant => !variant
    )
  ) {
    const error =
      new Error(
        "Invalid product selection"
      );

    error.statusCode = 400;

    throw error;
  }

  return selected;
}


function saveProductVariants(
  productId,
  files,
  body
) {
  const variants =
    parseAdminVariants(body);

  const existing =
    db.prepare(
      `SELECT *
       FROM product_variants
       WHERE product_id = ?
       ORDER BY
         position ASC,
         id ASC`
    )
      .all(String(productId));

  const keepIds =
    new Set();

  const updateStatement =
    db.prepare(`
      UPDATE product_variants
      SET
        position = ?,
        name = ?,
        external_product_id = ?,
        image_blob = ?,
        image_filename = ?,
        image_mime = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
      AND product_id = ?
    `);

  const updateWithoutImage =
    db.prepare(`
      UPDATE product_variants
      SET
        position = ?,
        name = ?,
        external_product_id = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE id = ?
      AND product_id = ?
    `);

  const insertStatement =
    db.prepare(`
      INSERT INTO product_variants (
        product_id,
        position,
        name,
        external_product_id,
        image_blob,
        image_filename,
        image_mime
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

  variants.forEach(
    (variant, index) => {
      const imageFile =
        files?.[
          `variant_image_${index + 1}`
        ]?.[0] ||
        null;

      if (variant.id) {
        const matching =
          existing.find(
            row =>
              Number(row.id) ===
              Number(variant.id)
          );

        if (!matching) {
          return;
        }

        keepIds.add(
          Number(variant.id)
        );

        if (imageFile) {
          updateStatement.run(
            variant.position,
            variant.name,
            variant.external_product_id ||
              null,
            imageFile.buffer,
            imageFile.originalname,
            imageFile.mimetype,
            variant.id,
            String(productId)
          );
        } else {
          updateWithoutImage.run(
            variant.position,
            variant.name,
            variant.external_product_id ||
              null,
            variant.id,
            String(productId)
          );
        }

        return;
      }

      const result =
        insertStatement.run(
          String(productId),
          variant.position,
          variant.name,
          variant.external_product_id ||
            null,
          imageFile?.buffer ||
            null,
          imageFile?.originalname ||
            null,
          imageFile?.mimetype ||
            null
        );

      keepIds.add(
        Number(
          result.lastInsertRowid
        )
      );
    }
  );

  existing.forEach(row => {
    if (
      !keepIds.has(
        Number(row.id)
      )
    ) {
      db.prepare(
        `DELETE FROM product_variants
         WHERE id = ?
         AND product_id = ?`
      ).run(
        row.id,
        String(productId)
      );
    }
  });
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


function saveProductVideos(
  productId,
  files,
  body
) {
  for (
    let slot = 1;
    slot <= 4;
    slot++
  ) {
    const remove =
      String(
        body?.[
          `remove_video_${slot}`
        ] || ""
      ) === "true";

    if (remove) {
      db.prepare(
        `DELETE FROM product_videos
         WHERE product_id = ?
         AND slot = ?`
      ).run(
        String(productId),
        slot
      );
    }

    const file =
      files?.[
        `video_${slot}`
      ]?.[0];

    if (!file) {
      continue;
    }

    db.prepare(`
      INSERT INTO product_videos (
        product_id,
        slot,
        video_blob,
        video_filename,
        video_mime,
        updated_at
      )

      VALUES (
        ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(
        product_id,
        slot
      )
      DO UPDATE SET
        video_blob =
          excluded.video_blob,

        video_filename =
          excluded.video_filename,

        video_mime =
          excluded.video_mime,

        updated_at =
          CURRENT_TIMESTAMP
    `).run(
      String(productId),
      slot,
      file.buffer,
      file.originalname,
      file.mimetype ||
        "video/mp4"
    );
  }
}


function safeId(name) {
  const base =
    String(name)
      .toLowerCase()
      .trim()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      )
      .slice(0, 50) ||
    "product";

  let candidate =
    base;

  let n = 2;

  while (
    productById(
      candidate
    )
  ) {
    candidate =
      `${base}-${n++}`;
  }

  return candidate;
}


async function discordUser(
  accessToken
) {
  const response =
    await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (!response.ok) {
    return null;
  }

  return response.json();
}


async function requireUser(
  req,
  res,
  next
) {
  try {
    /*
     * LOCAL ACTIVITY DEVELOPMENT
     *
     * Uses ADMIN_DISCORD_USER_ID as the current development
     * creator while we build/test the Activity UI.
     */
    if (
      process.env.NODE_ENV !== "production" &&
      req.headers[
        "x-creator-deals-dev"
      ] === "1"
    ) {
      const devUserId =
        process.env
          .ADMIN_DISCORD_USER_ID;

      if (!devUserId) {
        return res
          .status(500)
          .json({
            error:
              "ADMIN_DISCORD_USER_ID is missing"
          });
      }

      req.discordUser = {
        id:
          String(devUserId),

        username:
          "Austin",

        global_name:
          "Austin Taylor",

        avatar:
          null
      };

      req.developmentUser =
        true;

      return next();
    }

    /*
     * Production OAuth path stays available.
     */
    const auth =
      req.headers.authorization ||
      "";

    const token =
      auth.startsWith(
        "Bearer "
      )
        ? auth.slice(7)
        : null;

    if (!token) {
      return res
        .status(401)
        .json({
          error:
            "Missing access token"
        });
    }

    const user =
      await discordUser(token);

    if (!user) {
      return res
        .status(401)
        .json({
          error:
            "Invalid Discord session"
        });
    }

    req.discordUser =
      user;

    req.accessToken =
      token;

    next();

  } catch (error) {
    console.error(error);

    res
      .status(500)
      .json({
        error:
          "Authentication failed"
      });
  }
}


function requireAdmin(
  req,
  res,
  next
) {
  if (
    !process.env
      .ADMIN_DISCORD_USER_ID
  ) {
    return res
      .status(500)
      .json({
        error:
          "ADMIN_DISCORD_USER_ID not configured"
      });
  }

  if (
    String(
      req.discordUser.id
    ) !==
    String(
      process.env
        .ADMIN_DISCORD_USER_ID
    )
  ) {
    return res
      .status(403)
      .json({
        error:
          "Admin only"
      });
  }

  next();
}


/* =========================================================
   OAUTH
========================================================= */

app.post(
  "/api/token",
  async (req, res) => {
    try {
      const {
        code
      } = req.body;

      const response =
        await fetch(
          "https://discord.com/api/oauth2/token",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body:
              new URLSearchParams({
                client_id:
                  process.env.CLIENT_ID,

                client_secret:
                  process.env
                    .DISCORD_CLIENT_SECRET,

                grant_type:
                  "authorization_code",

                code
              })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        console.error("DISCORD OAUTH ERROR");
        console.error("status:", response.status);
        console.error("response:", data);

        return res.status(400).json({
          error:
            data?.error_description ||
            data?.error ||
            "Discord OAuth failed"
        });
      }

      res.json({
        access_token:
          data.access_token
      });
    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          error:
            "OAuth token exchange failed"
        });
    }
  }
);


/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/me",
  requireUser,
  (req, res) => {
    res.json({
      id:
        req.discordUser.id,

      username:
        req.discordUser.username,

      globalName:
        req.discordUser.global_name,

      avatar:
        req.discordUser.avatar,

      isAdmin:
        String(
          req.discordUser.id
        ) ===
        String(
          process.env
            .ADMIN_DISCORD_USER_ID
        )
    });
  }
);


/* =========================================================
   PRODUCTS
========================================================= */

app.get(
  "/api/categories",
  (req, res) => {
    const row =
      db.prepare(
        `SELECT value
         FROM app_settings
         WHERE key = ?`
      ).get("category_order");

    let categories;

    try {
      categories =
        JSON.parse(
          row?.value || "[]"
        );
    } catch {
      categories = [];
    }

    if (!categories.length) {
      categories = [
        "All",
        "Fashion",
        "Food",
        "Sports",
        "Home",
        "Beauty",
        "Tech",
        "Other"
      ];
    }

    res.json(categories);
  }
);



app.get(
  "/api/products",
  (req, res) => {
    const category =
      String(
        req.query.category ||
        "all"
      );

    let rows;

    if (
      category.toLowerCase() ===
      "all"
    ) {
      rows =
        db.prepare(
          `SELECT *
           FROM products
           WHERE active = 1
           ORDER BY
             CASE
               WHEN sort_order > 0 THEN 0
               ELSE 1
             END,
             sort_order ASC,
             rowid DESC`
        ).all();
    } else {
      rows =
        db.prepare(
          `SELECT *
           FROM products
           WHERE active = 1
           AND lower(category) =
               lower(?)
           ORDER BY
             CASE
               WHEN category_sort_order > 0 THEN 0
               ELSE 1
             END,
             category_sort_order ASC,
             rowid DESC`
        ).all(category);
    }

    res.json(
      rows.map(
        normalizeProduct
      )
    );
  }
);


app.get(
  "/api/products/:id",
  (req, res) => {
    const product =
      productById(
        req.params.id
      );

    if (!product) {
      return res
        .status(404)
        .json({
          error:
            "Product not found"
        });
    }

    res.json(product);
  }
);


app.get(
  "/api/products/:id/image",
  async (req, res) => {
    const row =
      db.prepare(
        `SELECT
           image_blob,
           image_filename,
           image_mime,
           image_url,
           image_key
         FROM products
         WHERE id = ?`
      )
      .get(
        String(
          req.params.id
        )
      );

    if (!row) {
      return res
        .sendStatus(404);
    }

    if (row.image_key) {
      try {
        const imageUrl =
          await getSignedUrl(
            r2,
            new GetObjectCommand({
              Bucket:
                R2_BUCKET,
              Key:
                row.image_key
            }),
            {
              expiresIn:
                60 * 60
            }
          );

        res.setHeader(
          "Cache-Control",
          "private,no-store"
        );

        return res.redirect(
          302,
          imageUrl
        );

      } catch (error) {
        console.error(
          "R2 product image URL error:",
          error
        );

        return res
          .sendStatus(502);
      }
    }

    /*
     * Legacy SQLite image fallback.
     */
    if (
      row.image_blob &&
      row.image_blob.length > 0
    ) {
      res.setHeader(
        "Content-Type",
        row.image_mime ||
        "image/jpeg"
      );

      res.setHeader(
        "Cache-Control",
        "public,max-age=300"
      );

      return res.send(
        row.image_blob
      );
    }

    if (row.image_url) {
      return res.redirect(
        row.image_url
      );
    }

    res.redirect(
      "https://cdn.discordapp.com/embed/avatars/0.png"
    );
  }
);


app.get(
  "/api/products/:productId/variants/:variantId/image",
  async (req, res) => {
    const row =
      db.prepare(
        `SELECT
           image_blob,
           image_filename,
           image_mime,
           image_key
         FROM product_variants
         WHERE id = ?
         AND product_id = ?`
      )
        .get(
          Number(
            req.params.variantId
          ),
          String(
            req.params.productId
          )
        );

    if (!row) {
      return res
        .sendStatus(404);
    }

    if (row.image_key) {
      try {
        const imageUrl =
          await getSignedUrl(
            r2,
            new GetObjectCommand({
              Bucket:
                R2_BUCKET,
              Key:
                row.image_key
            }),
            {
              expiresIn:
                60 * 60
            }
          );

        res.setHeader(
          "Cache-Control",
          "private,no-store"
        );

        return res.redirect(
          302,
          imageUrl
        );

      } catch (error) {
        console.error(
          "R2 variant image URL error:",
          error
        );

        return res
          .sendStatus(502);
      }
    }

    /*
     * Legacy SQLite BLOB fallback.
     */
    if (
      !row.image_blob ||
      row.image_blob.length === 0
    ) {
      return res
        .sendStatus(404);
    }

    res.setHeader(
      "Content-Type",
      row.image_mime ||
      "image/jpeg"
    );

    res.setHeader(
      "Cache-Control",
      "public,max-age=300"
    );

    res.send(
      row.image_blob
    );
  }
);


app.get(
  "/api/products/:id/videos/:slot",
  async (req, res) => {
    const slot =
      Number(req.params.slot);

    if (
      !Number.isInteger(slot) ||
      slot < 1 ||
      slot > 4
    ) {
      return res
        .sendStatus(404);
    }

    const row =
      db.prepare(
        `SELECT
           video_blob,
           video_filename,
           video_mime,
           video_key
         FROM product_videos
         WHERE product_id = ?
         AND slot = ?`
      )
        .get(
          String(
            req.params.id
          ),
          slot
        );

    if (
      row?.video_key
    ) {
      try {
        const playbackUrl =
          await getSignedUrl(
            r2,

            new GetObjectCommand({
              Bucket:
                R2_BUCKET,

              Key:
                row.video_key
            }),

            {
              expiresIn:
                60 * 60
            }
          );

        res.setHeader(
          "Cache-Control",
          "private,no-store"
        );

        return res.redirect(
          302,
          playbackUrl
        );

      } catch (error) {
        console.error(
          "R2 playback URL error:",
          error
        );

        return res
          .sendStatus(502);
      }
    }

    /*
     * Legacy SQLite BLOB fallback.
     * Existing videos continue working until migrated to R2.
     */
    if (
      !row?.video_blob ||
      row.video_blob.length === 0
    ) {
      return res
        .sendStatus(404);
    }

    const video =
      row.video_blob;

    const size =
      video.length;

    const mime =
      row.video_mime ||
      "video/mp4";

    const range =
      req.headers.range;

    res.setHeader(
      "Accept-Ranges",
      "bytes"
    );

    res.setHeader(
      "Cache-Control",
      "public,max-age=300"
    );

    if (!range) {
      res.setHeader(
        "Content-Type",
        mime
      );

      res.setHeader(
        "Content-Length",
        size
      );

      return res.send(
        video
      );
    }

    const match =
      /^bytes=(\d*)-(\d*)$/
        .exec(range);

    if (!match) {
      res.setHeader(
        "Content-Range",
        `bytes */${size}`
      );

      return res
        .sendStatus(416);
    }

    let start =
      match[1]
        ? Number(match[1])
        : 0;

    let end =
      match[2]
        ? Number(match[2])
        : size - 1;

    if (
      start >= size ||
      start < 0 ||
      end < start
    ) {
      res.setHeader(
        "Content-Range",
        `bytes */${size}`
      );

      return res
        .sendStatus(416);
    }

    end =
      Math.min(
        end,
        size - 1
      );

    const chunk =
      video.subarray(
        start,
        end + 1
      );

    res.status(206);

    res.setHeader(
      "Content-Type",
      mime
    );

    res.setHeader(
      "Content-Length",
      chunk.length
    );

    res.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${size}`
    );

    res.send(chunk);
  }
);


/* =========================================================
   CREATOR PROFILE
========================================================= */

app.get(
  "/api/profile",
  requireUser,
  (req, res) => {
    const userId =
      String(
        req.discordUser.id
      );

    let row =
      db.prepare(
        `SELECT *
         FROM creator_profiles
         WHERE discord_user_id = ?`
      ).get(userId);

    if (!row) {
      db.prepare(
        `INSERT INTO creator_profiles (
           discord_user_id
         )
         VALUES (?)`
      ).run(userId);

      row =
        db.prepare(
          `SELECT *
           FROM creator_profiles
           WHERE discord_user_id = ?`
        ).get(userId);
    }

    res.json(row);
  }
);


app.put(
  "/api/profile",
  requireUser,
  (req, res) => {
    const userId =
      String(
        req.discordUser.id
      );

    const values = {
      tiktok_handle:
        req.body
          .tiktok_handle ||
        null,

      instagram_handle:
        req.body
          .instagram_handle ||
        null,

      email:
        req.body.email ||
        null,

      address:
        req.body.address ||
        null,

      city:
        req.body.city ||
        null,

      state:
        req.body.state ||
        null,

      zip_code:
        req.body.zip_code ||
        null,

      shirt_size:
        req.body.shirt_size ||
        null,

      shoe_size:
        req.body.shoe_size ||
        null
    };

    db.prepare(`
      INSERT INTO creator_profiles (
        discord_user_id,
        tiktok_handle,
        instagram_handle,
        email,
        address,
        city,
        state,
        zip_code,
        shirt_size,
        shoe_size,
        updated_at
      )

      VALUES (
        @discord_user_id,
        @tiktok_handle,
        @instagram_handle,
        @email,
        @address,
        @city,
        @state,
        @zip_code,
        @shirt_size,
        @shoe_size,
        CURRENT_TIMESTAMP
      )

      ON CONFLICT(discord_user_id)
      DO UPDATE SET
        tiktok_handle =
          excluded.tiktok_handle,

        instagram_handle =
          excluded.instagram_handle,

        email =
          excluded.email,

        address =
          excluded.address,

        city =
          excluded.city,

        state =
          excluded.state,

        zip_code =
          excluded.zip_code,

        shirt_size =
          excluded.shirt_size,

        shoe_size =
          excluded.shoe_size,

        updated_at =
          CURRENT_TIMESTAMP
    `).run({
      discord_user_id:
        userId,
      ...values
    });

    const row =
      db.prepare(
        `SELECT *
         FROM creator_profiles
         WHERE discord_user_id = ?`
      ).get(userId);

    res.json(row);
  }
);


/* =========================================================
   PRODUCT REQUEST
========================================================= */

app.post(
  "/api/requests",
  requireUser,
  (req, res) => {
    const userId =
      String(
        req.discordUser.id
      );

    const product =
      productById(
        req.body.productId
      );

    if (
      !product ||
      !product.active
    ) {
      return res
        .status(404)
        .json({
          error:
            "Product unavailable"
        });
    }

    let selectedVariants;

    try {
      selectedVariants =
        validateSelectedVariants(
          product,
          req.body.selectedVariantIds
        );
    } catch (error) {
      return res
        .status(
          error.statusCode || 400
        )
        .json({
          error:
            error.message ||
            "Invalid product selection"
        });
    }

    const profile =
      db.prepare(
        `SELECT *
         FROM creator_profiles
         WHERE discord_user_id = ?`
      ).get(userId);

    if (
      !profile?.tiktok_handle
    ) {
      return res
        .status(400)
        .json({
          error:
            "TikTok username required"
        });
    }

    const existing =
      db.prepare(
        `SELECT id
         FROM product_requests
         WHERE discord_user_id = ?
         AND product_id = ?
         LIMIT 1`
      )
      .get(
        userId,
        String(product.id)
      );

    if (existing) {
      return res
        .status(409)
        .json({
          error:
            "You already requested this product"
        });
    }

    const result =
      db.prepare(`
        INSERT INTO product_requests (
          discord_user_id,
          product_id,
          tiktok_handle,
          status,
          source
        )
        VALUES (?, ?, ?, 'pending', 'activity')
      `).run(
        userId,
        String(product.id),
        profile.tiktok_handle
      );

    if (
      selectedVariants.length > 0
    ) {
      const insertVariant =
        db.prepare(`
          INSERT INTO product_request_variants (
            request_id,
            variant_id,
            variant_name_snapshot,
            external_product_id_snapshot,
            position
          )
          VALUES (?, ?, ?, ?, ?)
        `);

      const saveSelections =
        db.transaction(() => {
          selectedVariants.forEach(
            (variant, index) => {
              insertVariant.run(
                result.lastInsertRowid,
                Number(variant.id),
                variant.name || "",
                variant.external_product_id ||
                  null,
                index + 1
              );
            }
          );
        });

      saveSelections();
    }

    void sendAdminRequestPing(
      product.id
    );

    res.json({
      ok: true,

      requestId:
        result.lastInsertRowid
    });
  }
);


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

app.get(
  "/api/admin/products",
  requireUser,
  requireAdmin,
  (req, res) => {
    const rows =
      db.prepare(
        `SELECT *
         FROM products
         ORDER BY rowid DESC`
      ).all();

    res.json(
      rows.map(
        normalizeProduct
      )
    );
  }
);


app.post(
  "/api/admin/products",
  requireUser,
  requireAdmin,
  upload.fields([
    {
      name: "image",
      maxCount: 1
    },
    {
      name: "video_1",
      maxCount: 1
    },
    {
      name: "video_2",
      maxCount: 1
    },
    {
      name: "video_3",
      maxCount: 1
    },
    {
      name: "video_4",
      maxCount: 1
    },
    {
      name: "variant_image_1",
      maxCount: 1
    },
    {
      name: "variant_image_2",
      maxCount: 1
    },
    {
      name: "variant_image_3",
      maxCount: 1
    },
    {
      name: "variant_image_4",
      maxCount: 1
    },
    {
      name: "variant_image_5",
      maxCount: 1
    },
    {
      name: "variant_image_6",
      maxCount: 1
    },
    {
      name: "variant_image_7",
      maxCount: 1
    },
    {
      name: "variant_image_8",
      maxCount: 1
    },
    {
      name: "variant_image_9",
      maxCount: 1
    },
    {
      name: "variant_image_10",
      maxCount: 1
    },
    {
      name: "variant_image_11",
      maxCount: 1
    },
    {
      name: "variant_image_12",
      maxCount: 1
    },
  ]),
  (req, res) => {
    const id =
      safeId(
        req.body.name
      );

    const active =
      String(
        req.body.active
      ) === "true"
        ? 1
        : 0;

    const imageFile =
      req.files?.image?.[0] ||
      null;

    db.prepare(`
      INSERT INTO products (
        id,
        name,
        brand,
        category,
        description,
        commission,
        shop_ads,
        free_sample,
        requirements,
        brand_website,
        image_blob,
        image_filename,
        image_mime,
        variants_enabled,
        variant_selection_limit,
        active
      )

      VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )
    `).run(
      id,

      req.body.name,

      req.body.brand,

      req.body.category,

      req.body.description ||
      "",

      req.body.commission ||
      "0%",

      req.body.shop_ads ||
      "—",

      req.body.free_sample ||
      "Auto-Approved",

      req.body.requirements ||
      "1 TikTok Shoppable Video",

      req.body.brand_website ||
      "",

      imageFile?.buffer ||
      null,

      imageFile?.originalname ||
      null,

      imageFile?.mimetype ||
      null,

      String(
        req.body.variants_enabled
      ) === "true"
        ? 1
        : 0,

      Math.max(
        1,
        Math.min(
          12,
          Number(
            req.body.variant_selection_limit
          ) || 1
        )
      ),

      active
    );

    saveProductVariants(
      id,
      req.files,
      req.body
    );

    saveProductVideos(
      id,
      req.files,
      req.body
    );

    res.json(
      productById(id)
    );
  }
);


app.put(
  "/api/admin/products/:id",
  requireUser,
  requireAdmin,
  upload.fields([
    {
      name: "image",
      maxCount: 1
    },
    {
      name: "video_1",
      maxCount: 1
    },
    {
      name: "video_2",
      maxCount: 1
    },
    {
      name: "video_3",
      maxCount: 1
    },
    {
      name: "video_4",
      maxCount: 1
    },
    {
      name: "variant_image_1",
      maxCount: 1
    },
    {
      name: "variant_image_2",
      maxCount: 1
    },
    {
      name: "variant_image_3",
      maxCount: 1
    },
    {
      name: "variant_image_4",
      maxCount: 1
    },
    {
      name: "variant_image_5",
      maxCount: 1
    },
    {
      name: "variant_image_6",
      maxCount: 1
    },
    {
      name: "variant_image_7",
      maxCount: 1
    },
    {
      name: "variant_image_8",
      maxCount: 1
    },
    {
      name: "variant_image_9",
      maxCount: 1
    },
    {
      name: "variant_image_10",
      maxCount: 1
    },
    {
      name: "variant_image_11",
      maxCount: 1
    },
    {
      name: "variant_image_12",
      maxCount: 1
    },
  ]),
  (req, res) => {
    const id =
      String(
        req.params.id
      );

    const current =
      productById(id);

    if (!current) {
      return res
        .status(404)
        .json({
          error:
            "Product not found"
        });
    }

    const active =
      String(
        req.body.active
      ) === "true"
        ? 1
        : 0;

    const imageFile =
      req.files?.image?.[0] ||
      null;

    if (imageFile) {
      db.prepare(`
        UPDATE products
        SET
          name = ?,
          brand = ?,
          category = ?,
          description = ?,
          commission = ?,
          shop_ads = ?,
          brand_website = ?,
          image_blob = ?,
          image_filename = ?,
          image_mime = ?,
          image_url = NULL,
          variants_enabled = ?,
          variant_selection_limit = ?,
          active = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        req.body.name,
        req.body.brand,
        req.body.category,
        req.body.description || "",
        req.body.commission || "0%",
        req.body.shop_ads || "—",
        req.body.brand_website || "",
        imageFile.buffer,
        imageFile.originalname,
        imageFile.mimetype,

        String(
          req.body.variants_enabled
        ) === "true"
          ? 1
          : 0,

        Math.max(
          1,
          Math.min(
            12,
            Number(
              req.body.variant_selection_limit
            ) || 1
          )
        ),

        active,
        id
      );
    } else {
      db.prepare(`
        UPDATE products
        SET
          name = ?,
          brand = ?,
          category = ?,
          description = ?,
          commission = ?,
          shop_ads = ?,
          brand_website = ?,
          variants_enabled = ?,
          variant_selection_limit = ?,
          active = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        req.body.name,
        req.body.brand,
        req.body.category,
        req.body.description || "",
        req.body.commission || "0%",
        req.body.shop_ads || "—",
        req.body.brand_website || "",

        String(
          req.body.variants_enabled
        ) === "true"
          ? 1
          : 0,

        Math.max(
          1,
          Math.min(
            12,
            Number(
              req.body.variant_selection_limit
            ) || 1
          )
        ),

        active,
        id
      );
    }

    saveProductVariants(
      id,
      req.files,
      req.body
    );

    saveProductVideos(
      id,
      req.files,
      req.body
    );

    res.json(
      productById(id)
    );
  }
);


app.delete(
  "/api/admin/products/:id",
  requireUser,
  requireAdmin,
  (req, res) => {
    const id =
      String(
        req.params.id
      );

    db.prepare(
      `DELETE FROM product_videos
       WHERE product_id = ?`
    ).run(id);

    db.prepare(
      `DELETE FROM product_variants
       WHERE product_id = ?`
    ).run(id);

    db.prepare(
      `DELETE FROM products
       WHERE id = ?`
    ).run(id);

    res.json({
      ok: true
    });
  }
);


/* =========================================================
   START
========================================================= */

app.listen(
  PORT,
  () => {
    console.log(
      `✓ Activity API listening on http://localhost:${PORT}`
    );

    console.log(
      `✓ Using database: ${DB_PATH}`
    );
  }
);
