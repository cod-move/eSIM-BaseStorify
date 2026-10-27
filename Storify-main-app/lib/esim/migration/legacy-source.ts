import "server-only";

import type { LegacyEsimRow, LegacyUserRow } from "./legacy-rows";

/**
 * Reading the old store's MySQL database (MIG), in production only: the
 * connection comes from `.env` and nothing else —
 *
 *   LEGACY_MYSQL_HOST, LEGACY_MYSQL_PORT (3306), LEGACY_MYSQL_DATABASE,
 *   LEGACY_MYSQL_USER, LEGACY_MYSQL_PASSWORD,
 *   LEGACY_MYSQL_SSL ("true"), LEGACY_MYSQL_SSL_REJECT_UNAUTHORIZED ("true")
 *
 * the same names the rewrite's importer used. Everything is read inside one
 * read-only transaction with a consistent snapshot, so users and their eSIMs
 * agree with each other however busy the old store still is.
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
  order by id
`;

/** Active data eSIMs of verified users, with the supplier and plan they were bought on. */
const ESIM_QUERY = `
  select e.id, e.user_id, lower(trim(p.slug)) provider_slug, pl.provider_plan_id, pl.name plan_name,
         oi.purchase_id, e.serial_number, e.provider_sim_id, e.iccid, e.phone_number, e.qr_code,
         e.activation_deadline, e.expiry_date, e.profile_status, e.remark,
         cast(e.info as char) info, e.status, e.created_at
  from esims e
  join users u on u.id = e.user_id and u.ev = 1
  left join esim_providers p on p.id = e.esim_provider_id
  left join order_items oi on oi.id = e.order_item_id
  left join plans pl on pl.id = oi.plan_id
  where e.status = 1 and (e.expiry_date is null or e.expiry_date >= now())
  order by e.id
`;

export interface LegacySnapshot {
  users: LegacyUserRow[];
  esims: LegacyEsimRow[];
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
    const [esims] = await connection.query(ESIM_QUERY);
    await connection.query("COMMIT");
    return { users: users as LegacyUserRow[], esims: esims as LegacyEsimRow[] };
  } finally {
    await connection.end().catch(() => undefined);
  }
}
