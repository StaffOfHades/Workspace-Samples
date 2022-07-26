const core = require('@actions/core');
const context = require('@actions/github').context;
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils');
const { throttling } = require("@octokit/plugin-throttling")

const RELEASE_COUNT_LIMIT = 1000

const GitHubOctokit = GitHub.plugin(throttling)

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
      .filter(({ tag_name }) => tag_name.includes(tagName))
    core.info(`Found ${releasesForTag.length} release(s) whose tag_name matches '${tagName}'`)
    if (releasesForTag.length === 0) {
      core.warning(`No release founds for tag_name '${tagName}'`)
      core.setOutput("deleted-assets", []);
      core.setOutput("failed-assets", []);
    }

    const assetIdsForTag = releasesForTag
      .map(({ assets }) => assets)
      .flat()
      .map(({ id }) => id)
    if (assetIdsForTag.length === 0) {
      core.warning(`No assets found under release(s) with tag_name '${tagName}'`)
      core.setOutput("deleted-assets", []);
      core.setOutput("failed-assets", []);
      return;
    }
    const results = await Promise.allSettled(assetIdsForTag.map(asset_id => octokit.rest.repos.deleteReleaseAsset({ ...context.repo, asset_id })))
    const breakdown = results.reduce((output, result, index) => {
      if (result.status === 'fulfilled') {
        output.deleted.push(assetIdsForTag[index]);
      } else {
        output.failed.push(assetIdsForTag[index]);
      }
      return output;
    }, { deleted: [], failed: [] })
    core.info(JSON.stringify(breakdown, null, 2))

    core.setOutput("deleted-assets", breakdown.deleted);
    core.setOutput("failed-assets", breakdown.failed);
  } catch (error) {
    core.error(error)
    core.setFailed(error.message);
  }
}

deleteReleaseAssets()
