# Franklin Admirals Hockey Website - Complete Setup Guide

## 📋 What You Got

A complete, professional multi-page hockey website with:
- ✅ Home page (games & stats preview)
- ✅ Full game schedule page
- ✅ Complete roster page
- ✅ Detailed statistics page
- ✅ Contact page with form
- ✅ Professional NHL.com-style design
- ✅ Responsive mobile-friendly layout
- ✅ Ready to deploy to Vercel or GitHub Pages

## 🎨 Customization Checklist

### Before You Deploy

Go through each file and make these changes:

#### 1. Contact Information (in ALL pages)
Find and replace `[Your Name]` with your actual name
Find and replace these with real contact info:
- `coach@franklinhockey.edu` → your actual email
- `(615) 555-0147` → your actual phone
- `Franklin, TN` → your actual location

**Files to update:**
- `index.html` - Footer
- `pages/schedule.html` - Footer
- `pages/roster.html` - Footer
- `pages/stats.html` - Footer
- `pages/contact.html` - All sections

#### 2. Team Information (index.html)
- Update hero subtitle if needed
- Update featured games
- Update season statistics

#### 3. Game Schedule (pages/schedule.html)
Replace all sample games with your real schedule:
- Game dates
- Opponent names
- Game times
- Arena locations

#### 4. Roster (pages/roster.html)
- Replace player names with real names
- Update jersey numbers
- Update positions
- Update grade levels (Senior, Junior, etc.)
- Add coaching staff names

#### 5. Statistics (pages/stats.html)
- Update all season statistics
- Update player scoring leaders
- Update goaltender stats
- Update defenseman stats

#### 6. Contact Page (pages/contact.html)
- Update all contact information
- Add office hours
- Add mailing address
- Update email/phone

## 🚀 Deployment Steps

### Step 1: Create GitHub Account
1. Go to https://github.com/signup
2. Create account with any username
3. Verify your email

### Step 2: Create Repository
1. Go to https://github.com/new
2. Repository name: `admirals-hockey`
3. Description: "Franklin High School Admirals Hockey Website"
4. Select "Public"
5. Click "Create repository"

### Step 3: Upload Your Files
You have 2 options:

**Option A: Using Git (Recommended)**
```bash
# In your admirals-hockey folder:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/admirals-hockey.git
git branch -M main
git push -u origin main
```

**Option B: Upload Files Directly**
1. On GitHub, click "Upload files"
2. Drag and drop all files
3. Commit changes

### Step 4: Deploy to Vercel (Faster Option)
1. Go to https://vercel.com/signup
2. Sign up with GitHub
3. Click "New Project"
4. Select `admirals-hockey` repository
5. Click "Deploy"
6. Wait 1 minute for deployment
7. You'll get a URL like: `admirals-hockey.vercel.app`

### Alternative: Deploy to GitHub Pages
1. Go to your repository on GitHub
2. Click Settings
3. Scroll to "Pages"
4. Under "Source", select "main" branch
5. Click Save
6. Wait 2 minutes
7. Your site will be at: `yourusername.github.io/admirals-hockey`

## 📝 Files Included

```
admirals-hockey/
├── index.html                    # Home page
├── pages/
│   ├── schedule.html            # Game schedule
│   ├── roster.html              # Team roster
│   ├── stats.html               # Statistics
│   └── contact.html             # Contact info
├── assets/
│   ├── css/
│   │   └── styles.css           # All styling
│   └── includes/
│       └── header-footer.html    # Reusable components
├── vercel.json                   # Vercel config
├── .gitignore                    # Git ignore rules
├── README.md                     # Full documentation
└── DEPLOY.md                     # Deployment guide
```

## 🔧 Making Changes Later

After deployment, updating is simple:

1. Edit any HTML file locally
2. Save the file
3. Run:
   ```bash
   git add .
   git commit -m "Update [what changed]"
   git push
   ```
4. Site updates automatically in 30-60 seconds

## 🎨 Customizing Colors

The maroon color is set to `#5e1825` in `/assets/css/styles.css`

To change it:
1. Open `/assets/css/styles.css`
2. Find: `--primary-maroon: #5e1825;`
3. Replace with your color
4. All colors throughout the site update automatically

Other colors to customize:
- `--dark-maroon: #3d0f18;` - Darker shade
- `--accent-gold: #d4a574;` - Accent color
- `--white: #FFFFFF;` - Background
- `--light-gray: #f0f0f0;` - Card backgrounds

## 📱 Mobile Testing

Your site is fully responsive. Test on:
- Desktop browsers
- Mobile browsers (Safari, Chrome)
- Tablets

All should look perfect automatically.

## ✨ Future Enhancements

After launch, consider adding:

1. **Photo Gallery**
   - Create `/assets/images/` folder
   - Add game photos
   - Create new gallery page

2. **Team News/Blog**
   - New page for latest updates
   - Game recaps
   - Team announcements

3. **Video Highlights**
   - Embed YouTube videos
   - Game highlights page

4. **Social Media Links**
   - Add to footer
   - Link to team social accounts

5. **Parent Portal**
   - Important documents
   - Practice times
   - Equipment info

6. **Merchandise Store**
   - Link to school store
   - Team gear ordering

## 🆘 Troubleshooting

**Q: Site shows 404 error**
A: Wait 5 minutes for deployment to complete

**Q: Links don't work**
A: Make sure you're accessing via `vercel.app` or `github.io`, not `file://`

**Q: Images don't load**
A: Check image paths start with `/assets/`

**Q: Form doesn't work**
A: Currently logs to console. For emails, integrate Formspree (see DEPLOY.md)

**Q: Want custom domain?**
A: In Vercel/GitHub Pages settings, add your domain name

## 📚 Resources

- HTML Help: https://www.w3schools.com/html/
- CSS Help: https://www.w3schools.com/css/
- Vercel Support: https://vercel.com/support
- GitHub Help: https://docs.github.com

## 🎯 Next Steps

1. ✅ Customize all files with real information
2. ✅ Test all links locally
3. ✅ Create GitHub account
4. ✅ Deploy to Vercel
5. ✅ Share URL with team
6. ✅ Keep stats and schedule updated

## 💡 Pro Tips

- Update schedule weekly
- Keep stats current
- Add game photos to gallery
- Post team news regularly
- Share site link on social media

---

**Your website is ready! Start customizing and deploy when ready. Good luck! 🏒**
