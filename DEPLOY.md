# Quick Start Guide - Deploy Your Hockey Website

## Choose Your Platform

### 🚀 VERCEL (Recommended - Faster & Better)

**5 Minute Setup:**

1. Go to https://github.com/new
2. Create a new repository called `admirals-hockey`
3. Follow the commands to push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/admirals-hockey.git
   git branch -M main
   git push -u origin main
   ```

4. Go to https://vercel.com
5. Click "New Project"
6. Select your GitHub repository
7. Click "Deploy"
8. Done! Your site is live

**Get Your URL:**
- Vercel gives you a free domain: `admirals-hockey.vercel.app`
- Or add your own domain in Project Settings

---

### 🐙 GitHub Pages (Free but Slower)

**5 Minute Setup:**

1. Go to https://github.com/new
2. Create repository named `admirals-hockey`
3. Push your code (see Vercel step 3 above)
4. Go to Settings → Pages
5. Select "main" branch as source
6. Done! Site lives at: `yourusername.github.io/admirals-hockey`

---

## After Deployment

### Update Your Site

Any changes push automatically:

```bash
git add .
git commit -m "Update schedule"
git push
```

### Customize Before Deploying

Edit these files first:
- `/index.html` - Update team info
- `/pages/roster.html` - Add real player names
- `/pages/schedule.html` - Add real game dates
- `/pages/stats.html` - Update real stats
- `/pages/contact.html` - Add your email/phone

Replace all `[Your Name]` placeholders with your actual information.

---

## Vercel vs GitHub Pages Comparison

| Feature | Vercel | GitHub Pages |
|---------|--------|-------------|
| Speed | 🚀 Very Fast | ✓ Fast |
| Setup Time | 2 min | 3 min |
| Custom Domain | ✓ Easy | ✓ Easy |
| HTTPS | ✓ Yes | ✓ Yes |
| Cost | Free | Free |
| Uptime | 99.95% | 99.9% |

**Verdict:** Vercel is slightly faster and has better performance, but both are excellent choices.

---

## Troubleshooting

**Site not updating after push?**
- Wait 1-2 minutes for deployment
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

**Links broken on deployed site?**
- All paths use `/pages/` which is correct for root deployment

**Want to change your domain?**
- Vercel: Settings → Domains → Add custom domain
- GitHub Pages: Settings → Pages → Custom domain

---

## Next Steps

After deployment:

1. ✅ Share the link with players and parents
2. ✅ Add your real contact info to Contact page
3. ✅ Update roster with real player names
4. ✅ Add upcoming game schedule
5. ✅ Consider adding team photos/gallery

---

**Need help?**
- Vercel Docs: https://vercel.com/docs
- GitHub Pages: https://pages.github.com
- HTML Questions: https://developer.mozilla.org/en-US/docs/Web/HTML

**Your site is ready to go! 🎉**
