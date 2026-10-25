/**
 * eSIM supplier setup from the command line, until the admin pages exist.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-provider.ts <command> ...
 *
 * Commands:
 *   list                                   suppliers and their last sync
 *   set <code> [--name N] [--currency EUR] [--status active|disabled]
 *              [--priority 10] [--cred key=value ...] [--cred-env key=ENV_NAME ...]
 *                                          create or update; secret keys are encrypted;
 *                                          --cred-env reads the value from the environment
 *   probe <code>                           one authenticated call to prove the credentials
 *   sync <code|all>                        pull the catalogue into EsimPlan
 *
 * Credentials passed with --cred land in shell history; prefer --cred-env with
 * the value kept in .env, e.g. --cred-env apiKey=STELLAR_API_KEY.
 */
import { connectDB, disconnectDB } from "@/lib/db";
import { EsimProvider } from "@/models/esim-provider.model";
import { adapterFor, applyCredentials, findProvider } from "@/lib/esim/provider-service";
import { PROVIDER_CODES, PROVIDER_DEFINITIONS, isProviderCode } from "@/lib/esim/providers/registry";
import { syncAllCatalogs, syncProviderCatalog } from "@/lib/esim/catalog/sync";

function options(args: string[]) {
  const named: Record<string, string> = {};
  const credentials: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1] ?? "";
    if (flag === "--cred" || flag === "--cred-env") {
      const separator = value.indexOf("=");
      if (separator < 1) throw new Error(`${flag} expects key=value, got "${value}"`);
      const key = value.slice(0, separator);
      const source = value.slice(separator + 1);
      if (flag === "--cred-env" && !process.env[source]) {
        throw new Error(`${flag} ${key}: environment variable ${source} is empty`);
      }
      credentials[key] = flag === "--cred-env" ? process.env[source]! : source;
      index += 1;
    } else if (flag.startsWith("--")) {
      named[flag.slice(2)] = value;
      index += 1;
    }
  }
  return { named, credentials };
}

async function main() {
  const [command, code, ...rest] = process.argv.slice(2);
  await connectDB();

  switch (command) {
    case "list": {
      for (const provider of await EsimProvider.find().sort({ priority: 1 })) {
        const sync = provider.lastSync;
        console.log(
          `${provider.code.padEnd(12)} ${provider.status.padEnd(9)} ${provider.settlementCurrency}  ` +
            (sync ? `sync ${sync.status} ${sync.finishedAt?.toISOString() ?? ""} seen=${sync.seen ?? 0} retired=${sync.retired ?? 0}` : "never synced"),
        );
      }
      break;
    }
    case "set": {
      if (!code || !isProviderCode(code)) {
        throw new Error(`Unknown provider "${code}". Known: ${PROVIDER_CODES.join(", ")}`);
      }
      const { named, credentials } = options(rest);
      const provider =
        (await findProvider(code)) ??
        new EsimProvider({
          code,
          name: PROVIDER_DEFINITIONS[code].displayName,
          settlementCurrency: named.currency ?? (code === "stellar" ? "EUR" : "USD"),
        });
      if (named.name) provider.name = named.name;
      if (named.currency) provider.settlementCurrency = named.currency.toUpperCase();
      if (named.status === "active" || named.status === "disabled") provider.status = named.status;
      if (named.priority) provider.priority = Number(named.priority);
      applyCredentials(provider, credentials);
      await provider.save();
      console.log(`Saved ${code} (${provider.status}); credentials set: ${[
        ...provider.credentials.keys(),
        ...provider.secretCredentials.keys(),
      ].join(", ") || "none"}`);
      break;
    }
    case "probe": {
      const provider = await findProvider(code ?? "");
      if (!provider) throw new Error(`No provider "${code}"`);
      try {
        const result = await adapterFor(provider).probe();
        provider.lastProbe = { at: new Date(), ok: true, message: result.message };
        console.log(result.message, result.metadata);
      } catch (error) {
        provider.lastProbe = { at: new Date(), ok: false, message: String(error).slice(0, 500) };
        throw error;
      } finally {
        await provider.save();
      }
      break;
    }
    case "sync": {
      const results =
        code === "all"
          ? await syncAllCatalogs()
          : await (async () => {
              const provider = await findProvider(code ?? "");
              if (!provider) throw new Error(`No provider "${code}"`);
              return [await syncProviderCatalog(provider)];
            })();
      console.table(results);
      break;
    }
    default:
      console.log("Commands: list | set <code> ... | probe <code> | sync <code|all>");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
