import requests
from datetime import datetime, timezone, timedelta
from github import Github, GithubException


SENSITIVE_PATTERNS = [
    ".env", ".env.local", ".env.production", ".env.development",
    ".env.staging", ".env.backup", "secrets.json", "credentials.json",
    "id_rsa", "id_rsa.pub", ".pem", ".p12", ".pfx",
    "service-account.json", "keyfile.json", "api_keys.py",
    ".npmrc", ".pypirc", "config/secrets", "vault.json",
]


def _matches_sensitive(filename: str) -> bool:
    lower = filename.lower()

    return any(
        lower == p or lower.endswith("/" + p) or lower.endswith(p)
        for p in SENSITIVE_PATTERNS
    )



class GitHubSyncService:

    def __init__(self, token: str):

        self.token = token
        self.client = Github(token)

        self._headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }



    def account(self):

        user = self.client.get_user()

        return {

            "id": user.id,
            "login": user.login,
            "name": user.name,
            "avatar": user.avatar_url,
            "followers": user.followers,
            "following": user.following,
            "public_repos": user.public_repos,

        }



    def repositories(self):

        repos = []

        for repo in self.client.get_user().get_repos():

            repos.append({

                "id": repo.id,
                "name": repo.name,
                "full_name": repo.full_name,
                "private": repo.private,
                "language": repo.language,
                "stars": repo.stargazers_count,
                "forks": repo.forks_count,
                "default_branch": repo.default_branch,
                "updated_at": str(repo.updated_at),
                "html_url": repo.html_url,

            })


        return repos




    def security_scan(self):

        repos = list(
            self.client.get_user().get_repos()
        )


        since = (
            datetime.now(timezone.utc)
            -
            timedelta(days=30)
        )


        env_pushes = self._scan_env_pushes(
            repos,
            since
        )


        secret_alerts = self._scan_secret_alerts(
            repos
        )


        dep_alerts = self._scan_dep_alerts(
            repos
        )


        exposed_repos = self._scan_exposed_repos(
            repos
        )



        return {


            "repos": [

                {

                    "id": r.id,

                    "full_name": r.full_name,

                    "name": r.name,

                    "private": r.private,

                    "language": r.language,

                    "stars": r.stargazers_count,

                    "forks": r.forks_count,

                    "open_issues": r.open_issues_count,

                    "updated_at": str(r.updated_at),

                    "default_branch": r.default_branch,

                    "url": r.html_url,

                }

                for r in repos

            ],



            "env_pushes": env_pushes,


            "secret_alerts": secret_alerts,


            "dep_alerts": dep_alerts,


            "exposed_repos": exposed_repos,



            "stats": {


                "total_repos": len(repos),


                "private_repos": sum(
                    1 for r in repos if r.private
                ),


                "public_repos": sum(
                    1 for r in repos if not r.private
                ),


                "env_push_count": len(env_pushes),


                "secret_alert_count": len(secret_alerts),


                "dep_alert_count": len(dep_alerts),


                "exposed_repo_count": len(exposed_repos),

            },

        }






    def _scan_env_pushes(self, repos, since):

        results = []

        checks = 0



        for repo in repos[:10]:


            if checks >= 30:
                break



            try:

                commits = list(
                    repo.get_commits(
                        since=since
                    )
                )[:5]



                for commit in commits:


                    if checks >= 30:
                        break



                    checks += 1



                    try:


                        matched = [

                            f.filename

                            for f in commit.files

                            if _matches_sensitive(
                                f.filename
                            )

                        ]



                        if matched:


                            results.append({

                                "repo": repo.full_name,

                                "sha": commit.sha[:7],

                                "sha_full": commit.sha,

                                "author": (
                                    commit.commit.author.name
                                ),

                                "timestamp": (
                                    commit.commit.author.date
                                    .isoformat()
                                ),

                                "message": (
                                    commit.commit.message
                                    .split("\n")[0][:120]
                                ),

                                "files": matched,

                                "url": commit.html_url,

                            })


                    except Exception:

                        continue



            except Exception:

                continue



        return results






    def _scan_secret_alerts(self, repos):

        results = []



        for repo in repos[:10]:


            url = (
                f"https://api.github.com/repos/"
                f"{repo.full_name}/secret-scanning/alerts"
            )



            try:


                resp = requests.get(
                    url,
                    headers=self._headers,
                    timeout=5,
                )



                if resp.status_code != 200:
                    continue



                for alert in resp.json():


                    if alert.get("state") == "open":


                        results.append({

                            "repo": repo.full_name,

                            "secret_type":
                                alert.get(
                                    "secret_type_display_name",
                                    alert.get("secret_type")
                                ),

                            "state": alert.get("state"),

                            "created_at":
                                alert.get("created_at"),

                            "url":
                                alert.get("html_url"),

                        })



            except Exception:

                continue



        return results







    def _scan_dep_alerts(self, repos):

        results = []



        for repo in repos[:10]:


            url = (
                f"https://api.github.com/repos/"
                f"{repo.full_name}/dependabot/alerts"
                "?state=open&per_page=10"
            )



            try:


                resp = requests.get(
                    url,
                    headers=self._headers,
                    timeout=5,
                )



                if resp.status_code != 200:
                    continue



                for alert in resp.json():


                    adv = alert.get(
                        "security_advisory",
                        {}
                    )


                    dep = alert.get(
                        "dependency",
                        {}
                    )



                    results.append({

                        "repo": repo.full_name,


                        "package":
                            dep.get(
                                "package",
                                {}
                            ).get(
                                "name"
                            ),


                        "severity":
                            adv.get(
                                "severity",
                                "unknown"
                            ),


                        "summary":
                            adv.get(
                                "summary"
                            ),


                        "fixed_in":
                            alert.get(
                                "security_vulnerability",
                                {}
                            )
                            .get(
                                "first_patched_version",
                                {}
                            )
                            .get(
                                "identifier"
                            ),


                        "url":
                            alert.get(
                                "html_url"
                            ),

                    })



            except Exception:

                continue



        return results







    def _scan_exposed_repos(self, repos):

        results = []



        for repo in repos[:10]:


            if repo.private:

                continue



            try:

                repo.get_contents(
                    ".gitignore"
                )



            except GithubException as e:


                if e.status == 404:


                    results.append({

                        "repo": repo.full_name,

                        "url": repo.html_url,

                        "language": repo.language,

                    })



            except Exception:

                continue



        return results






    def repo_peek(self, full_name: str):

        repo = self.client.get_repo(full_name)



        commits = []


        try:

            for c in list(repo.get_commits())[:10]:

                commits.append({

                    "sha": c.sha[:7],

                    "message":
                        c.commit.message
                        .split("\n")[0][:100],

                    "author":
                        c.commit.author.name,

                    "timestamp":
                        c.commit.author.date
                        .isoformat(),

                    "url":
                        c.html_url,

                })


        except Exception:

            pass




        languages = {}


        try:

            languages = repo.get_languages()

        except Exception:

            pass





        contributors = []



        try:

            for c in list(repo.get_contributors())[:5]:

                contributors.append({

                    "login": c.login,

                    "avatar": c.avatar_url,

                    "url": c.html_url,

                    "contributions": c.contributions,

                })


        except Exception:

            pass





        branches = []


        try:

            branches = [

                b.name

                for b in list(
                    repo.get_branches()
                )[:10]

            ]


        except Exception:

            pass




        return {

            "full_name": repo.full_name,

            "description": repo.description,

            "stars": repo.stargazers_count,

            "forks": repo.forks_count,

            "open_issues": repo.open_issues_count,

            "private": repo.private,

            "default_branch": repo.default_branch,

            "topics": repo.get_topics(),

            "created_at":
                repo.created_at.isoformat(),

            "updated_at":
                repo.updated_at.isoformat(),

            "language": repo.language,

            "languages": languages,

            "branches": branches,

            "contributors": contributors,

            "commits": commits,

            "url": repo.html_url,

        }
