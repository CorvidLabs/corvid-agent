import { glob } from 'glob';
import * as path from 'path';

export async function loadSkills() {
  const skills = new Map<string, any>();
  
  // Load built-in skills
  const skillFiles = await glob('server/mcp/skills/*.ts');
  
  for (const file of skillFiles) {
    try {
      const module = await import(path.resolve(file));
      const skill = module.default;
      if (skill && skill.name) {
        skills.set(skill.name, skill);
      }
    } catch (err) {
      console.error(`Failed to load skill from ${file}:`, err);
    }
  }
  
  return skills;
}

// Simple base for skill definitions
export function defineSkill(config: any) {
  return config;
}

// Export zod-like validation (simplified for now)
export const z = {
  string: () => ({
    url: () => ({ optional: () => z.string(), describe: (desc: string) => z.string() }),
    max: (n: number) => ({ optional: () => z.string(), describe: (desc: string) => z.string() }),
    optional: () => z.string(),
    describe: (desc: string) => z.string(),
  }),
  object: (schema: any) => ({
    describe: (desc: string) => schema,
  }),
};
