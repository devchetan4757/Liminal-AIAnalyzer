from github import Github
from github.GithubException import BadCredentialsException


class GitHubAuthService:

    @staticmethod
    def validate(token: str):
        try:
            github = Github(token)
            user = github.get_user()

            return {
                "valid": True,
                "login": user.login,
                "name": user.name,
                "id": user.id,
            }

        except BadCredentialsException:
            raise Exception("Invalid GitHub token")
