import { load } from "https://deno.land/std@0.210.0/dotenv/mod.ts";
import Logger from "https://deno.land/x/logger@v1.1.3/logger.ts";
import { None, Option, Some } from "npm:@octantis/option";

const log = new Logger();

export type Mapper<A, B> = (a: A) => B;

export class Env {
  private constructor(private readonly env: Record<string, string>) {}
  static async load() {
    const env = await load();
    return new Env(env);
  }
  read(key: string): Option<string> {
    if (this.env[key] == null) {
      return None();
    }
    return Some(this.env[key]);
  }
  get(key: string, or?: string): string;
  get<T>(key: string, or: string | undefined, mapper: Mapper<string, T>): T;
  get<T>(key: string, or?: string, mapper?: Mapper<string, T>): T | string {
    const value = this.read(key);
    if (value.isEmpty() && or == null) {
      log.error(`Environment variable ${key} is missing!`);
      return Deno.exit(1);
    }
    if (mapper != null) {
      return value
        .orElse(Some(or ?? ""))
        .map(mapper)
        .get();
    }
    return value.getOrElse(or ?? "");
  }
}

export const env = await Env.load();
