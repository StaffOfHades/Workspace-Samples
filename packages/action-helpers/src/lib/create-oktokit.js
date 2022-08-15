const core = require('@actions/core');
const { GitHub, getOctokitOptions } = require('@actions/github/lib/utils');
const { throttling } = require("@octokit/plugin-throttling")

const GitHubOctokit = GitHub.plugin(throttling)

export function createOktokit() {
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
  return octokit;
}
