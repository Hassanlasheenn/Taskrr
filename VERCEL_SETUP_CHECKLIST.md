# Vercel Setup Checklist

## Required GitHub Secrets

Make sure these are set in: **GitHub → Settings → Secrets and variables → Actions**

### ✅ VERCEL_PROJECT_ID
**Value:** `prj_6OpzD2vvSJlJObpyIOP3nstYgxd4`

### ⚠️ VERCEL_TOKEN
**How to get:**
1. Go to: https://vercel.com/account/tokens
2. Click **"Create Token"**
3. Name: `GitHub Actions`
4. Copy the token
5. Add to GitHub Secrets as `VERCEL_TOKEN`

### ⚠️ VERCEL_ORG_ID
**How to get:**
1. Go to: https://vercel.com/hassanlasheenns-projects/full-stack-todo-app
2. Look at the URL or:
   - Click your team name (top left)
   - Go to **Settings → General**
   - Find **Team ID** or **Organization ID**
   - It should be: `hassanlasheenns-projects` (from your URL)
3. Add to GitHub Secrets as `VERCEL_ORG_ID`

## Verify Secrets Are Set

1. Go to: https://github.com/Hassanlasheenn/Full-Stack-Todo-App/settings/secrets/actions
2. Check that all three secrets exist:
   - ✅ `VERCEL_TOKEN`
   - ✅ `VERCEL_ORG_ID` 
   - ✅ `VERCEL_PROJECT_ID` (should be `prj_6OpzD2vvSJlJObpyIOP3nstYgxd4`)

## Test Deployment

After setting all secrets:
1. Make a small change to `frontend/` directory
2. Commit and push to `main` or `develop`
3. Check GitHub Actions tab
4. Workflow should deploy successfully

## Common Issues

### "VERCEL_TOKEN secret is not set"
→ Add the token from https://vercel.com/account/tokens

### "VERCEL_ORG_ID secret is not set"  
→ Add your team/org ID (likely `hassanlasheenns-projects`)

### "Project not found"
→ Verify `VERCEL_PROJECT_ID` is exactly: `prj_6OpzD2vvSJlJObpyIOP3nstYgxd4`

### "Invalid token"
→ Generate a new token and update the secret

---

**Next Step:** Verify all three secrets are set, then push a change to trigger deployment.
