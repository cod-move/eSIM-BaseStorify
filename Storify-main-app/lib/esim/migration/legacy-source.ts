import "server-only";

import type { LegacyNumberRow, LegacyUserRow } from "./legacy-rows";

/**
 * Reading the old store's MySQL database (MIG), in production only: the
 * connection comes from `.env` and nothing else —
 *
 *   LEGACY_MYSQL_HOST, LEGACY_MYSQL_PORT (3306), LEGACY_MYSQL_DATABASE,
 *   LEGACY_MYSQL_USER, LEGACY_MYSQL_PASSWORD,
 *   LEGACY_MYSQL_SSL ("true"), LEGACY_MYSQL_SSL_REJECT_UNAUTHORIZED ("true")
 *
 * the same names the rewrite's importer used. Everything is read inside one
 * read-only transaction with a consistent snapshot, so users and the numbers
 * they bought agree with each other however busy the old store still is.
 */

export interface LegacySourceConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
}

export function legacySourceConfig(env: NodeJS.ProcessEnv = process.env): LegacySourceConfig | null {
  const host = env.LEGACY_MYSQL_HOST?.trim();
  const database = env.LEGACY_MYSQL_DATABASE?.trim();
  const user = env.LEGACY_MYSQL_USER?.trim();
  if (!host || !database || !user) return null;
  return {
    host,
    port: Number(env.LEGACY_MYSQL_PORT) || 3306,
    database,
    user,
    password: env.LEGACY_MYSQL_PASSWORD ?? "",
    ssl: env.LEGACY_MYSQL_SSL === "true",
    sslRejectUnauthorized: env.LEGACY_MYSQL_SSL_REJECT_UNAUTHORIZED !== "false",
  };
}

/** For the admin page: where it would read from, without the password. */
export function describeLegacySource(config: LegacySourceConfig | null): string | null {
  return config ? `${config.user}@${config.host}:${config.port}/${config.database}${config.ssl ? " (TLS)" : ""}` : null;
}

const USER_QUERY = `
  select id, firstname, lastname, username, email, dial_code, mobile, ref_by,
         cast(balance as char) balance, password, country_code, city, state, zip,
         address, status, ev, sv, created_at, updated_at
  from users
  where ev = 1 and status = 1
  order by id
`;

/**
 * Every number card in stock, sold or not. The buyer is the order's user, else the user of the
 * eSIM row the sale made.
 */
const NUMBER_QUERY = `
  select i.id, i.iccid, i.msisdn, i.dial_country_code, i.lpa, i.pin1, i.puk1, i.pin2, i.puk2,
         cast(i.price as char) price, cast(i.premium_price as char) premium_price, i.status,
         coalesce(o.user_id, (select e.user_id from esims e where e.iccid = i.iccid order by e.id desc limit 1)) user_id,
         coalesce(o.created_at, i.updated_at) sold_at, i.created_at
  from inventory_esims i
  left join orders o on o.id = i.order_id
  order by i.id
`;

export interface LegacySnapshot {
  users: LegacyUserRow[];
  numbers: LegacyNumberRow[];
}

export async function readLegacySnapshot(config: LegacySourceConfig): Promise<LegacySnapshot> {
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: config.sslRejectUnauthorized } : undefined,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 15_000,
  });
  try {
    await connection.query("SET SESSION TRANSACTION READ ONLY");
    await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const [users] = await connection.query(USER_QUERY);
    const [numbers] = await connection.query(NUMBER_QUERY);
    await connection.query("COMMIT");
    return { users: users as LegacyUserRow[], numbers: numbers as LegacyNumberRow[] };
  } finally {
    await connection.end().catch(() => undefined);
  }
}
