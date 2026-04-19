# 🔄 Sharing Question Data Between Machines

## Quick Summary

Since your developer and you are on **different networks and laptops**, the local storage doesn't sync automatically. But you can easily share data using the **Export/Import** feature!

---

## 📤 Step 1: Developer Exports Data

1. Open **Developer Dashboard** on the developer's machine
2. Scroll to the top section with buttons
3. Click **"Export Data"** button
4. A JSON file downloads (e.g., `ielts_problems_2026-04-20.json`)
5. **Send this file to you** via email, WhatsApp, cloud drive, etc.

---

## 📥 Step 2: You Import the Data

1. Open **Developer Dashboard** on your machine
2. Scroll to the top section with buttons
3. Click **"Import Data"** button
4. Select the JSON file the developer sent you
5. You'll see a popup asking:
   - **"Merge with existing data?"**
   - **OK** = Keep your existing questions + add developer's questions
   - **Cancel** = Replace everything with developer's questions
6. Click your choice
7. Data appears! ✅

---

## 🔁 Workflow Example

```
Developer's Laptop
├─ Creates: "Reading Set 1"
├─ Creates: "Listening Set 1"
└─ Click Export → ielts_problems_2026-04-20.json

(Send file via email/cloud)

Your Laptop
├─ Click Import
├─ Select the JSON file
├─ Now you have: "Reading Set 1" + "Listening Set 1"
```

---

## 📋 Multiple Exports/Imports

You can repeat this process as many times as needed:

1. Developer adds more questions
2. Developer clicks Export (new file)
3. Send to you
4. You Import (adds to your database)
5. Repeat weekly, daily, or whenever you need fresh content

---

## 🎯 Best Practices

### For Developer (Creator)
- Export data **daily** or after adding new questions
- Name the file clearly: `reading_questions_week1.json`
- Use the **same** export file for all users

### For You (Admin)
- Always choose **"Merge"** if you want to keep existing data
- Choose **"Replace"** only if you want to start fresh
- Keep backup copies of important JSON files
- Import regularly to stay up-to-date

---

## 🔐 File Contents

The JSON file looks like this:

```json
{
  "reading": [
    {
      "title": "IELTS Academic Reading",
      "passageTitle": "...",
      "passageContent": "...",
      "questionGroups": [...]
    }
  ],
  "listening": [...],
  "writing": [...],
  "speaking": [...]
}
```

- Safe to share
- Safe to backup
- Can be edited manually if needed

---

## 💡 Pro Tips

### Backup Your Data
```bash
# Save a copy before importing
cp ielts_problems_2026-04-20.json ielts_problems_backup.json
```

### Organize by Date
- `ielts_questions_week1.json`
- `ielts_questions_week2.json`
- `ielts_questions_final.json`

### Merge Multiple Files
1. Import file from Developer 1
2. Import file from Developer 2
3. Import file from Developer 3
4. All questions merge into one database

---

## ⚠️ Important Notes

- **Each machine has local storage** - that's why export/import is needed
- **Storage servers run locally** - they don't sync across networks by default
- **No internet required** - this works even offline
- **No login required** - just export and share files

---

## 🆘 Troubleshooting

### "Invalid file format" Error
- Make sure it's a JSON file (ends with `.json`)
- File came from the "Export Data" button (not manually created)

### Data didn't import
- Check browser console (F12 → Console tab) for errors
- Make sure storage server is running: `python data_storage_server.py`
- Try importing again

### Lost data after import
- Ah! You should have chosen "Merge" instead of "Replace"
- Don't worry - check your backup files
- Import a backup if you have one

---

## 🚀 Workflow Summary

```
Weekly Update Cycle:

Mon:  Developer creates questions → Export → Send to you
Wed:  You import → See new questions in your test pages
Thu:  Developer adds more → Export again → You import again
Fri:  Final batch → Export → Import → Ready for testing!
```

That's it! Simple and effective. 🎉
