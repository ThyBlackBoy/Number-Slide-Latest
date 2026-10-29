export function getTargetScore(level: number): number {
  return Math.floor(400 * level * (1 + level * 0.35));
}

export function getLevelTitle(level: number): string {
  if (level < 5) return 'Fresher';
  if (level < 15) return 'Sharp';
  if (level < 30) return 'Correct';
  if (level < 50) return 'Pepper';
  if (level < 100) return 'Odogwu';
  return 'Chairman';
}

export function getRank(tile: number): { name: string; line: string } {
  if (tile >= 2048) return { name: 'Chairman', line: 'The board belongs to you' };
  if (tile >= 1024) return { name: 'Odogwu', line: 'People dey mention your name' };
  if (tile >= 512) return { name: 'Area', line: 'This side don know you' };
  if (tile >= 256) return { name: 'Pepper', line: 'You dey pepper them' };
  if (tile >= 128) return { name: 'Correct', line: 'You dey try' };
  if (tile >= 64) return { name: 'Sharp', line: 'Eyes don open' };
  if (tile >= 16) return { name: 'Learner', line: 'Just dey warm up' };
  return { name: 'Fresher', line: 'Just landed' };
}

export const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara',
];