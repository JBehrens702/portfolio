# Text fixes and proposed labels

This file lists each change that the build made to your Google Site text, and each UI label that Claude proposes. A UI label is a short fixed text of the layout, such as a button or a menu entry.

The seed (`content/seed/site.json`) copies your text word for word from the Google Site. The only changes are fixes of spelling, punctuation, and wrong technical terms (requirement 1.2.2). Each fix is in the table below, with the old and the new text (requirement 1.2.3). You can undo any fix in the admin page.

The test `scripts/seed.test.ts` reads the tables in this file. It checks that the seed equals the Google Site text, except for the fixes listed here. Keep the table format when you edit this file.

## Fixes

Each "Old text" and "New text" cell shows only the part of the sentence that changed, with some words around it.

| # | Page | Where | Old text | New text | Reason |
|---|---|---|---|---|---|
| 1 | `solidworks-experience` | Subtitle and home text | `A breif overview` | `A brief overview` | Spelling. |
| 2 | `solidworks-experience` | Subtitle and home text | `my Solidworks projects` | `my SolidWorks projects` | Spelling of the product name. The rest of the site writes "SolidWorks". |
| 3 | `solidworks-experience` | "GD&T Drawing Example" paragraph | `General Dimensioning and Tolerancing` | `Geometric Dimensioning and Tolerancing` | Wrong technical term. ASME Y14.5 defines GD&T as Geometric Dimensioning and Tolerancing. |
| 4 | `solidworks-experience` | "Desktop 3D Prints" paragraph | `TinkerCad` | `Tinkercad` | Spelling of the product name (Autodesk Tinkercad). |
| 5 | `turbine-testing-stand` | Subtitle and home text | `Collaboratory Project` | `Collaboratory Project.` | Punctuation. The sentence had no full stop. |
| 6 | `victaulic-internship` | First paragraph and home text | `Polyworks` | `PolyWorks` | Spelling of the product name (InnovMetric PolyWorks). |
| 7 | `volunteer-experience` | "Service Project in North Carolina" paragraph | `Hurricane Helene.  The` | `Hurricane Helene. The` | Punctuation. There were two spaces (a no-break space and a space) after the full stop. |

Not changed:

- Spaces at the start and the end of a text were removed. They do not show on a page.
- "Victaulic Co" (no full stop), "300W", "travelling", "Arduino (Coding Language)", and the text inside quotation marks stay as you wrote them. These are style, not errors.

## Removed by the owner

On 2026-10-09 the owner removed these Google Site items, to give the other content more space. The seed test `scripts/seed.test.ts` knows them (`OWNER_REMOVED`).

- Thermocouple Reader System page: the heading "Read my project record from the Version 1 system:" and the file `2024 11 05-ProjectRecord-JB.docx` under it.

## Changes of form (no words changed)

The new site stores the content in a different form from the Google Site. These changes move your words, but do not change them:

- The Google Site shows many paragraphs and captions in heading styles. The seed stores them as paragraphs and image captions.
- "Skills Demonstrated", "Client", "Clients", and "Employer" with their values are fact lists. The home page also shows the skills as a list, split at each comma.
- "Client" on the Thermocouple page has two lines ("Dr. Tim Burdett" and "Professor, Messiah University"). The seed keeps them as two lines of one value.
- The problem statements and the job description are quotes. They keep your quotation marks.
- The home heading "Hi, I'm Jonathan Behrens" is the tagline, and "Jonathan Behrens" is the name. Both are your words. If the name and the greeting together repeat too much, clear the tagline in the admin page.
- Each home block uses the "Selected Work" card label as its title. Each full page uses its page heading.
- The home text of each experience is the first paragraph of its page: the subtitle, or on the Victaulic page the first paragraph after the job description.
- The link "Turbine Testing Stand" in the GD&T paragraph now goes to the new Turbine Testing Stand page.
- The embedded ENGR111 tutorial video is now a link to the video on YouTube: https://www.youtube.com/watch?v=lXUrrETXG5M. The site has no video player.
- The two remaining Google Drive files are file blocks with your file names. They have no file yet, so they stay hidden until each file is uploaded.
- The "Summary" heading on the Victaulic page has an empty paragraph under it. Both stay hidden until you write the summary.
- No image has alt text. Alt text describes an image for people who cannot see it. Write it in the admin page.

## Labels from the Google Site (approved)

These labels are on the Google Site, so they start approved.

| Key | Text | Where it shows |
|---|---|---|
| `selectedWork` | `Selected Work` | The heading above the experiences on the home page. |
| `nextExperience` | `Next Experience` | The link at the end of each experience page. |
| `contactHeading` | `Get in touch:` | The heading above the contact links. |

## Proposed labels (need your approval)

Claude proposes these labels. The new layout needs them, and the Google Site has no text for them. The site does not publish while a label is not approved (requirement 1.2.7). Approve or rewrite each label in the admin page.

| Key | Proposed text | Where it shows |
|---|---|---|
| `readMore` | `Read more` | The link from a home block to its full page. |
| `resume` | `Resume` | The resume download button. It shows only after you upload a resume. |
| `softwareHeading` | `Software Projects` | The heading above the [UN]Quotable and Dashboard cards. |
| `aboutHeading` | `About Me` | The heading above your intro paragraphs. |
| `navWork` | `Work` | The menu link to the experiences. |
| `navAbout` | `About` | The menu link to your intro paragraphs. |
| `navContact` | `Contact` | The menu link to the contact links. |
| `menu` | `Menu` | The menu button on a phone. |
| `logoAlt` | `Jonathan Behrens' Portfolio` | The alt text of the logo, which links to the home page. This is the title of your Google Site. |
| `notFoundTitle` | `Page not found` | The heading of the page for an unknown address. |
| `backHome` | `Back to home` | The link from that page to the home page. |
| `downloadFile` | `Download` | The button of a project file, such as a report. |
| `previewMarker` | `Preview` | The marker at the top of the preview pages. Only you see it. |
