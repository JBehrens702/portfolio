import type { Experience } from "@/lib/content/schema";
import styles from "./Site.module.css";

/** The owner's skills of all experiences, each once, in page order. */
export function allSkills(experiences: readonly Experience[]): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const experience of experiences) {
    for (const skill of experience.skills) {
      const key = skill.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        skills.push(skill.trim());
      }
    }
  }
  return skills;
}

/**
 * A band of the owner's skills (their own words from each experience). With
 * scroll-driven animations, the rows slide sideways as the page scrolls, in
 * opposite directions; the motion follows the scroll, so it never moves by
 * itself. Without them, or with reduced motion, the chips wrap and stay still.
 */
export function SkillsMarquee({ experiences }: { experiences: readonly Experience[] }) {
  const skills = allSkills(experiences);
  if (skills.length === 0) return null;
  const rows = skills.length >= 8 ? [skills.filter((_, i) => i % 2 === 0), skills.filter((_, i) => i % 2 === 1)] : [skills];
  return (
    <div className={styles.marquee}>
      {rows.map((row, r) => (
        <ul key={r} role="list" className={styles.marqueeRow} data-direction={r % 2 === 0 ? "left" : "right"}>
          {row.map((skill) => (
            <li key={skill} className={styles.marqueeChip}>
              {skill}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export default SkillsMarquee;
