const unreleasedHeading = '## [Unreleased]';

/**
 * Turns the "Unreleased" section of CHANGELOG.md into a release section for `version`
 * and starts a new, empty "Unreleased" section above it.
 */
export function releaseChangelog(text, version, date) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version "${version}"`);
  }
  if (text.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }

  const start = text.indexOf(unreleasedHeading);
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no "${unreleasedHeading}" section`);
  }
  const bodyStart = start + unreleasedHeading.length;
  const nextSection = text.indexOf('\n## [', bodyStart);
  const body = text.slice(bodyStart, nextSection === -1 ? text.length : nextSection);
  if (body.trim() === '') {
    throw new Error(`The "${unreleasedHeading}" section of CHANGELOG.md is empty; add release notes first`);
  }

  return `${text.slice(0, start)}${unreleasedHeading}\n\n## [${version}] - ${date}${text.slice(bodyStart)}`;
}

export function latestReleasedVersion(text) {
  const match = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\]/m.exec(text);
  return match?.[1] ?? null;
}
