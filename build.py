#!/usr/bin/env python3
"""Assemble platform-specific skill packages from GUIDE.md + platform templates.

Usage:
  python3 build.py              # Build all skills for all platforms
  python3 build.py takeout      # Build a specific skill
  python3 build.py --list       # List available skills and platforms
"""

import os
import shutil
import argparse
import sys

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
SKILLS_DIR = os.path.join(REPO_ROOT, "skills")
DIST_DIR = os.path.join(REPO_ROOT, "dist")


def find_skills():
    """Discover all skills that have a GUIDE.md and platforms/ directory."""
    skills = {}
    if not os.path.isdir(SKILLS_DIR):
        return skills
    for name in sorted(os.listdir(SKILLS_DIR)):
        skill_dir = os.path.join(SKILLS_DIR, name)
        if not os.path.isdir(skill_dir):
            continue
        guide = os.path.join(skill_dir, "GUIDE.md")
        platforms_dir = os.path.join(skill_dir, "platforms")
        if os.path.isfile(guide) and os.path.isdir(platforms_dir):
            platforms = [
                p
                for p in sorted(os.listdir(platforms_dir))
                if os.path.isdir(os.path.join(platforms_dir, p))
            ]
            skills[name] = {"dir": skill_dir, "platforms": platforms}
    return skills


def build_skill(name, skill_info, output_root):
    """Build all platform variants for a single skill."""
    skill_dir = skill_info["dir"]

    with open(os.path.join(skill_dir, "GUIDE.md")) as f:
        guide_content = f.read()

    for platform in skill_info["platforms"]:
        platform_dir = os.path.join(skill_dir, "platforms", platform)
        out_dir = os.path.join(output_root, f"{name}-{platform}")
        os.makedirs(out_dir, exist_ok=True)

        # Assemble markdown files (replace {{GUIDE}} with guide content)
        for fname in os.listdir(platform_dir):
            if fname.endswith(".md"):
                with open(os.path.join(platform_dir, fname)) as f:
                    template = f.read()
                assembled = template.replace("{{GUIDE}}", guide_content)
                with open(os.path.join(out_dir, fname), "w") as f:
                    f.write(assembled)
                print(f"  {platform}/{fname}")

        # Copy scripts/
        scripts_dir = os.path.join(skill_dir, "scripts")
        if os.path.isdir(scripts_dir):
            shutil.copytree(
                scripts_dir, os.path.join(out_dir, "scripts"), dirs_exist_ok=True
            )

        # Copy src/ (for TypeScript skills)
        src_dir = os.path.join(skill_dir, "src")
        if os.path.isdir(src_dir):
            shutil.copytree(src_dir, os.path.join(out_dir, "src"), dirs_exist_ok=True)

        # Copy evals/
        evals_dir = os.path.join(skill_dir, "evals")
        if os.path.isdir(evals_dir):
            shutil.copytree(
                evals_dir, os.path.join(out_dir, "evals"), dirs_exist_ok=True
            )

        # Copy skill.yaml
        skill_yaml = os.path.join(skill_dir, "skill.yaml")
        if os.path.isfile(skill_yaml):
            shutil.copy2(skill_yaml, os.path.join(out_dir, "skill.yaml"))

        # Copy .env.example if present
        env_example = os.path.join(skill_dir, ".env.example")
        if os.path.isfile(env_example):
            shutil.copy2(env_example, os.path.join(out_dir, ".env.example"))


def main():
    parser = argparse.ArgumentParser(description="Build skill packages")
    parser.add_argument("skills", nargs="*", help="Skill names to build (default: all)")
    parser.add_argument("--list", action="store_true", help="List available skills")
    parser.add_argument(
        "--output", "-o", default=DIST_DIR, help=f"Output directory (default: {DIST_DIR})"
    )
    args = parser.parse_args()

    all_skills = find_skills()

    if not all_skills:
        print("No skills found in skills/", file=sys.stderr)
        sys.exit(1)

    if args.list:
        for name, info in all_skills.items():
            platforms = ", ".join(info["platforms"])
            print(f"  {name}: [{platforms}]")
        return

    # Determine which skills to build
    if args.skills:
        to_build = {}
        for s in args.skills:
            if s not in all_skills:
                print(f"Unknown skill: {s}", file=sys.stderr)
                print(f"Available: {', '.join(all_skills.keys())}", file=sys.stderr)
                sys.exit(1)
            to_build[s] = all_skills[s]
    else:
        to_build = all_skills

    # Clean output directory
    if os.path.exists(args.output):
        shutil.rmtree(args.output)

    # Build
    for name, info in to_build.items():
        print(f"Building {name}...")
        build_skill(name, info, args.output)

    print(f"\nDone. Output in {args.output}/")


if __name__ == "__main__":
    main()
