//const { HttpsProxyAgent }  = require ("https-proxy-agent");
const core = require('@actions/core');
const github = require('@actions/github');
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils');
const { throttling } = require("@octokit/plugin-throttling")
const path = require('path');
const fs = require('fs/promises');

const RELEASE_COUNT_LIMIT = 1000

const GitHubOctokit = GitHub.plugin(throttling)
const context = github.context;

async function uploadReleaseAssets() {
  try {
  	//const filesString = core.getInput('files', { required: true });
  	const filesString = "./dist/packages/desktop/dist/Desktop-0.1.0-arm64.dmg";
    const tagName = "0.1.0";
    const token = process.env.GITHUB_TOKEN;

    const files = filesString.split(' +');

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
    core.info(`Found ${releasesForTag.length} releases whose tag_name matches '${tagName}'`)
    const [release] = releasesForTag;
    if (release === undefined) {
      core.warning(`No releases founds for tag_name '${tagName}'`)
      core.setOutput("asset-urls", []);
    }
    const getContentLength = (file) => fs.stat(file).then(({ size }) => size)

    const filesData = await Promise.all(files.map(file => getContentLength(file).then(size => fs.readFile(file).then(data => ({ data, name: path.basename(file), size })))))
    core.info(JSON.stringify(filesData, null, 2))
    return;

    const results = await Promise.allSettled(filesData.map(({ data, name, size }) => octokit.rest.repos.uploadReleaseAsset({ ...context.repo, data, headers: { 'content-type': "binary/octet-stream", 'content-length': size }, name, release_id: release.id })))
    const assetUrls = results.reduce((output, result) => {
      if (result.status === 'fulfilled') {
        output.push(result.value.databrowser_download_url);
      }
      return output;
    }, [])
    core.info(JSON.stringify(assetUrls, null, 2))

    core.setOutput("asset-urls", assetUrls);
  } catch (error) {
    core.error(error)
    core.setFailed(error.message);
  }
}

uploadReleaseAssets()
