const core = require('@actions/core');
const context = require('@actions/github').context;
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils');
const { throttling } = require("@octokit/plugin-throttling")

const RELEASE_COUNT_LIMIT = 1000

const GitHubOctokit = GitHub.plugin(throttling)

async function publishRelease() {
  try {
    const tagName = "0.1.1";
    const token = process.env.GITHUB_TOKEN;

    const octokit = new GitHubOctokit(getOctokitOptions(token, {
      throttle: {
        onRateLimit: (retryAfter, options) => {
          octokit.log.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );

          // Retry twice after hitting a rate limit error, then give up
          if (options.request.retryCount <= 2) {
            console.log(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter, options) => {
          // does not retry, only logs a warning
          octokit.log.warn(
            `Abuse detected for request ${options.method} ${options.url}`
          );
        },
      },
    }))
    let releaseCount = 0
    const allReleases = await octokit.paginate(octokit.rest.repos.listReleases, context.repo, (response, done) => {
      releaseCount += response.data.length
      if (releaseCount >= RELEASE_COUNT_LIMIT) {
        done()
      }
      return response.data
    })
    const releasesForTag = allReleases
      .filter(({ draft, tag_name }) => tag_name.includes(tagName) && draft)
    core.info(`Found ${releasesForTag.length} draft release(s) whose tag_name matches '${tagName}'`)
    const [matchedRelease] = releasesForTag
    if (matchedRelease === undefined) {
      core.warning(`No draft release founds for tag_name '${tagName}'`)
      return;
    }
    await octokit.rest.repos.updateRelease({ ...context.repo, draft: false, release_id: matchedRelease.id })
    core.info(`Release ${matchedRelease.id} was published sucessfully`)

    core.setOutput("release-id", matchedRelease.id);
  } catch (error) {
    core.error(error)
    core.setFailed(error.message);
  }
}

publishRelease()
