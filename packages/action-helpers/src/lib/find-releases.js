const context = require('@actions/github').context;

const RELEASE_COUNT_LIMIT = 1000

export async function findReleases(octokit, limit = RELEASE_COUNT_LIMIT) {
  let releaseCount = 0
  const allReleases = await octokit.paginate(octokit.rest.repos.listReleases, context.repo, (response, done) => {
    releaseCount += response.data.length
    if (releaseCount >= limit) {
      done()
    }
    return response.data
  });
  return allReleases;
}
