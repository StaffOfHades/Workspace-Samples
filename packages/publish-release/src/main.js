const core = require('@actions/core');
const github = require('@actions/github');
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils');
const { throttling } = require("@octokit/plugin-throttling")

const RELEASE_COUNT_LIMIT = 1000

const GitHubOctokit = GitHub.plugin(throttling)
const context = github.context;

async function deleteReleaseAssets() {
  try {
    const tagName = core.getInput('tag', { required: true });
    const token = core.getInput('token', { required: true });

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
    core.info(`Found ${releasesForTag.length} dreaft release(s) whose tag_name matches '${tagName}'`)
    const [matchedRelease] = releasesForTag
    if (matchedRelease === undefined) {
      core.warning(`No draft release founds for tag_name '${tagName}'`)
    }
    await octokit.rest.repos.deleteReleaseAsset({ ...context.repo, draft: false, release_id: matchedRelease.id })

    core.setOutput("release-id", matchedRelease.id);
  } catch (error) {
    core.error(error)
    core.setFailed(error.message);
  }
}

deleteReleaseAssets()
