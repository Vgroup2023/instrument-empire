# Gmail to CRM bridge

Records the emails you choose in the CRM: who wrote, what was said, and when, filed on the right contact and deal. Mail
from your own addresses is recorded as sent. It only reads mail you label; it never sends, moves or deletes anything.

## Before you start
In Netlify set `INTEGRATION_KEY` (any long random value, for example from `openssl rand -hex 32`) and redeploy.

## 1. Get Outlook mail into Gmail
In Outlook (outlook.office.com): Settings, Mail, Rules, Add new rule.
- Condition: apply to all messages (or only the senders you want in the CRM).
- Action: **Redirect to** `globlexai+outlook@gmail.com`. Use Redirect rather than Forward: a redirected message keeps the
  customer as the sender, so the CRM files it on the right contact. (The `+outlook` part is a Gmail trick: it lands in the
  same inbox and gives you something to filter on.)
- Some companies block automatic forwarding to outside addresses. If the rule is refused or mail never arrives, your
  Microsoft 365 admin has to allow it (Exchange admin center, outbound spam policy, automatic forwarding).

## 2. Label it in Gmail
In Gmail: Settings, See all settings, Filters and Blocked Addresses, Create a new filter.
- To: `globlexai+outlook@gmail.com`, then Create filter, tick **Apply the label** and make a new label called `CRM`
  (also tick *Skip the Inbox* if you do not want the copies cluttering Gmail).
- Anything else you label `CRM` by hand is recorded too, including mail you want to log from Gmail itself.

## 3. Install the script
1. Go to script.google.com while signed in as globlexai@gmail.com, New project, and paste the contents of `Code.gs`.
2. Project settings (the gear), Script properties, add:
   - `CRM_URL` = `https://globlexus.globlexai.com`
   - `CRM_KEY` = your `INTEGRATION_KEY`
   - `MY_ADDRESSES` = `globlexai@gmail.com` plus your Outlook address (mail from these counts as sent by you)
   - optional: `LABEL` (default `CRM`) and `SINCE_DAYS` (how far back the first run looks, default 3)
3. Choose the function `test` and Run. Approve the permissions when asked. The log should say `CRM answered 200`, and a
   "Gmail bridge test" message appears in the CRM.
4. Choose `install` and Run. It checks every 5 minutes from now on.

## Switching to another mailbox
- **Another Gmail or Google Workspace account:** repeat step 3 there with the same properties, then run `uninstall` in the old one.
- **Straight from Outlook later:** keep the redirect rule but point it at the new Gmail address, or stop the redirect and
  use a connector such as Power Automate or Zapier that posts to the same URL with the same key; the CRM does not care
  where the message comes from, only that it arrives at `/api/integrations/crm/email` with the key.
- Both can run at once. A message the CRM has already recorded is ignored, so overlap is harmless.

## Troubleshooting
- `CRM answered 401`: the key does not match `INTEGRATION_KEY`. Redeploy Netlify after changing it.
- `CRM answered 404` or no answer: check `CRM_URL` (no trailing slash, no path).
- Nothing shows up: check the label is on the message and that `MY_ADDRESSES` is not catching the customer.
- Check what was recorded under **CRM, Connections & agents**, and the script's **Executions** page for errors.
