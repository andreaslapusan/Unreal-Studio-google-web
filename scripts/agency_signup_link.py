#!/usr/bin/env python3
"""Handoff contract with the outreach reply bot (plan item 8). The bot builds ONE URL and never touches the DB.

  from agency_signup_link import signup_link, application_status
  url = signup_link("info@agency.com", src="world", tier="world", campaign="dubai-nov", thread_ref="<msg-id>", lang="en")

URL:   https://unrealstudiobali.com/agencias/registrar?lang={lang}&ref={token}&utm_source=outreach&utm_campaign={world|qm_es}
Token: base64url(json).base64url(HMAC-SHA256(AGENCY_REF_SECRET, base64url(json)))
       json = {email, src: world|qm_es, tier: world|es5|es3, campaign, thread_ref, exp: now+14d}
       Secret: env AGENCY_REF_SECRET or ~/.config/agency_ref_secret (same value as the agency-hub edge secret).
       A valid token whose email matches the form = instant approval + welcome email.
Stop following up: application_status(email) -> 'none' | 'pending' | 'approved' | 'rejected' | 'suspended' | 'deleted'
       (RPC agency_application_status, service role). Stop when it is not 'none'.
CLI:   agency_signup_link.py <email> <world|qm_es> [tier] [lang]   |   agency_signup_link.py --status <email>
"""
import base64, hashlib, hmac, json, os, sys, time, urllib.parse, urllib.request

SITE = "https://unrealstudiobali.com"
SB = "https://rnielxgackkshnatvagj.supabase.co"


def _secret():
    s = os.environ.get("AGENCY_REF_SECRET") or open(os.path.expanduser("~/.config/agency_ref_secret")).read()
    return s.strip().encode()


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def make_token(email, src, tier, campaign="", thread_ref="", days=14):
    assert src in ("world", "qm_es") and tier in ("world", "es5", "es3")
    body = _b64(json.dumps({"email": email.strip().lower(), "src": src, "tier": tier, "campaign": campaign,
                            "thread_ref": thread_ref, "exp": int(time.time()) + days * 86400}, separators=(",", ":")).encode())
    return body + "." + _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())


def signup_link(email, src="world", tier=None, campaign="", thread_ref="", lang=None):
    tier = tier or ("world" if src == "world" else "es5")
    lang = lang or ("es" if src == "qm_es" else "en")
    q = {"lang": lang, "ref": make_token(email, src, tier, campaign, thread_ref), "utm_source": "outreach", "utm_campaign": src}
    return f"{SITE}/agencias/registrar?" + urllib.parse.urlencode(q)


def application_status(email):
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or open(os.path.expanduser("~/.config/supabase_service_role_key")).read().strip()
    req = urllib.request.Request(f"{SB}/rest/v1/rpc/agency_application_status", data=json.dumps({"p_email": email}).encode(),
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "--status":
        print(application_status(a[1]))
    else:
        print(signup_link(a[0], a[1] if len(a) > 1 else "world", a[2] if len(a) > 2 else None, lang=a[3] if len(a) > 3 else None))
