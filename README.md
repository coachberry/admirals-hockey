# Franklin High School Admirals Hockey Website

A professional, multi-page hockey team website built with vanilla HTML, CSS, and JavaScript. Inspired by NHL.com design aesthetics.

## Features

- **Responsive Design** - Works on mobile, tablet, and desktop
- **Multiple Pages**
  - Home - Featured games and season stats at a glance
  - Schedule - Full season game schedule
  - Roster - Complete team roster with coaching staff
  - Stats - Detailed player and team statistics
  - Contact - Team contact information and contact form
- **Professional Styling** - Maroon (#5e1825) and white team colors
- **Fast Loading** - Static HTML, no build process needed
- **Easy Customization** - Update player names, dates, and stats in HTML

## Project Structure

```
admirals-hockey/
├── index.html                 # Home page
├── pages/
│   ├── schedule.html         # Game schedule
│   ├── roster.html           # Team roster
│   ├── stats.html            # Team statistics
│   └── contact.html          # Contact information
├── assets/
│   ├── css/
│   │   └── styles.css        # Shared stylesheet
│   └── js/
│       └── navigation.js      # Navigation script (optional)
└── README.md                  # This file
```

## Getting Started

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/admirals-hockey.git
cd admirals-hockey
```

2. Open in your browser:
   - Option 1: Double-click `index.html`
   - Option 2: Use a local server (recommended for testing)
     ```bash
     python -m http.server 8000
     # Visit http://localhost:8000
     ```

### Customization

Edit the following files to personalize the website:

1. **Team Colors** - Update `--primary-maroon` in `/assets/css/styles.css`
2. **Player Names** - Edit player cards in `/pages/roster.html`
3. **Game Schedule** - Update game cards in `/pages/schedule.html` and `/index.html`
4. **Team Stats** - Modify stat numbers in `/pages/stats.html` and `/index.html`
5. **Contact Info** - Update footer and contact page in all files

## Deployment Options

### Option 1: GitHub Pages (Free & Simple)

**Steps:**

1. Create a GitHub account at https://github.com
2. Create a new public repository named `admirals-hockey`
3. Clone this project and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/admirals-hockey.git
   git branch -M main
   git push -u origin main
   ```
4. Go to repository Settings → Pages
5. Set "Source" to "main" branch
6. Your site will be live at: `https://yourusername.github.io/admirals-hockey`

**Pros:**
- Completely free
- No server to maintain
- Automatic HTTPS
- Easy updates (just push to GitHub)

**Cons:**
- Slightly slower than Vercel
- Limited to static content (no backend)

### Option 2: Vercel (Faster & More Features)

**Steps:**

1. Push your project to GitHub (see GitHub Pages setup first)
2. Go to https://vercel.com and sign up
3. Click "New Project"
4. Select "Import Git Repository"
5. Choose your `admirals-hockey` repository
6. Vercel will auto-detect settings (no changes needed)
7. Click "Deploy"
8. Your site will be live at a Vercel URL (customizable)

**Custom Domain (Optional):**
- Go to Project Settings → Domains
- Add your custom domain
- Follow DNS instructions

**Pros:**
- Faster than GitHub Pages (CDN)
- Better analytics
- Environment variables support
- Serverless functions (for advanced features)
- Easy custom domain setup

**Cons:**
- Free tier has limitations (generous though)
- Requires Vercel account

### Recommended: Vercel

Vercel is recommended because it offers:
- Superior performance (global CDN)
- Faster deployments
- Better developer experience
- Scale-friendly if you add features later
- Free tier is more than sufficient for a team website

## Making Updates

After deployment, updating your site is easy:

1. Make changes locally (edit HTML/CSS files)
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Update game schedule"
   git push
   ```
3. Your site updates automatically within seconds

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Form Functionality

The contact form currently logs to the browser console. For email notifications:

**Option 1: Use Formspree (Free)**
1. Go to https://formspree.io
2. Create a new form
3. Update the form action in `/pages/contact.html`:
   ```html
   <form action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```

**Option 2: Use Netlify Forms**
(If deploying to Netlify instead)

## Tips & Tricks

- **Update Favicon**: Replace `/favicon.ico` with your school logo
- **Add Photos**: Create `/assets/images/` folder and add team photos
- **Social Media**: Add social links to footer
- **Team News**: Add a "News" section with latest updates
- **Photo Gallery**: Create a gallery page with game photos

## Troubleshooting

**Links not working?**
- Make sure you're viewing through a web server, not file://

**Styles not loading?**
- Clear your browser cache (Ctrl+Shift+Delete)

**Navigation highlighting incorrect?**
- The script detects the current page. Make sure HTML file names match nav links.

## License

This project is open source and available for personal use.

## Support

For questions or issues:
- Check file paths are correct (relative links use `/pages/`)
- Ensure all CSS links point to `/assets/css/styles.css`
- Verify HTML is properly formatted

---

**Built with ❤️ for the Franklin High School Admirals**
