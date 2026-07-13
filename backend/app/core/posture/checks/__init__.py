"""Import every check module here so its @register decorator fires on
app startup. This is the only place that needs to know a check module
exists -- registry.get_checks_for_provider() does the rest.

New check? Add one import line below. Nothing else needs to change.
"""
from app.core.posture.checks import credential_age  # noqa: F401
from app.core.posture.checks import anomaly_detection  # noqa: F401
from app.core.posture.checks import github_security_findings  # noqa: F401

# Supabase/Neon/Netlify misconfig checks (RLS status, public DB ingress,
# public preview deploys) are NOT included -- see note below. Add here
# once you've deliberately extended those providers' scope:
# from app.core.posture.checks import supabase_rls  # noqa: F401
# from app.core.posture.checks import neon_public_ingress  # noqa: F401
# from app.core.posture.checks import netlify_public_preview  # noqa: F401
