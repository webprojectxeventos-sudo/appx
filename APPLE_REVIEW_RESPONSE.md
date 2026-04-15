## Response to App Review — Submission d1d210a4-4ed7-4395-9932-367054bc59a3

Hi App Review team,

Thank you for the detailed feedback on build 1.0 (8). We have addressed all three items and uploaded a new build, **1.0 (10)**, that contains the fixes. Below is a point-by-point explanation for each guideline.

---

### 1) Guideline 2.1(a) — Performance: App Integrity

**Issue reported:** An error appeared when tapping "Iniciar escaner"; also, the user icon did not seem to work.

**Root cause:**

1. Our `Info.plist` was missing the `NSCameraUsageDescription` key. The scanner uses the device camera (via `getUserMedia`) to read ticket QR codes, and without that key iOS silently refuses camera access and the scanner fails to start.
2. The user icon in the admin header was rendered as a non-interactive element, so tapping it did nothing. Since the demo account you used logs in as a super_admin and is routed to the admin panel, that was the only way to reach the profile screen — and the broken icon made it unreachable.

**Fix (in build 10):**

- Added `NSCameraUsageDescription` to `Info.plist` with a clear user-facing explanation in Spanish:

  > "Project X usa la cámara para escanear códigos QR de entradas en el control de acceso al evento y para que puedas actualizar tu foto de perfil."

- Added `NSPhotoLibraryUsageDescription` as well, since the profile screen lets users pick an avatar from the photo library.
- The admin-header user icon is now a proper tappable link that navigates to the profile screen (`/profile`).
- We also added a user-facing error banner on the scanner screen that explains what to do if camera access is denied or the camera is unavailable, instead of silently failing.

**How to verify:**

1. Log in with the demo account (see review notes).
2. You will land on `Panel Admin → Resumen`.
3. In the bottom tab bar tap **Scanner**, then **Iniciar escáner**. iOS will now show the camera permission prompt, and after allowing, the camera feed appears with a QR target.
4. From any screen in the admin panel, tap your avatar in the top-right — it now navigates to **Mi perfil**.

---

### 2) Guideline 5.1.1(v) — Data Collection and Storage (account deletion)

**Issue reported:** The app supports account creation but does not include an option to initiate account deletion.

**Clarification:** Account deletion **is** implemented in the app and has been available since before this review cycle. We believe the reviewer could not reach it because, as explained above, the user-icon button in the admin header was not tappable — so when testing with the super_admin demo account there was no navigation path to `/profile`, where the deletion button lives. That navigation bug is now fixed in build 10.

**Where to find the Delete Account option (build 10):**

1. Log in with the demo account (credentials in the review notes).
2. You will land on `Panel Admin → Resumen`.
3. Tap the **user avatar icon** in the top-right corner of the admin header → you are taken to **Mi perfil**.
4. Scroll to the bottom of the profile screen. The last card, with a red border, is **"Eliminar cuenta"**.
5. Tap it, and a confirmation block opens with a warning, the list of data that will be deleted, and an input that requires the user to type the word **`ELIMINAR`** before the destructive button becomes enabled.
6. Tapping **"Eliminar mi cuenta"** permanently deletes:
   - the user profile row in our database,
   - all personal data (tickets, chat messages, gallery photos, votes, drink orders, push subscriptions, event memberships, avatar),
   - the Supabase Auth record — the account can never log in again.

The flow is entirely in-app, requires no customer service interaction, and is not a soft-delete / disable.

We also expose the same information to users who are not logged in via our public legal page:

- https://app.projectxeventos.es/delete-account

**Account deletion demo video:** A screen recording captured on a physical device that shows login → navigation to profile → deletion confirmation → account deleted has been included in the **App Review Information → Notes** field for this submission.

---

### 3) Guideline 1.5 — Safety: Support URL

**Issue reported:** The support URL `https://app.projectxeventos.es` does not lead to a page that users can use to ask questions or request support.

**Fix:** We have published a dedicated support page and updated the Support URL in App Store Connect to point to it:

- **New Support URL:** https://app.projectxeventos.es/support

This page is publicly reachable (no login required) and contains:

- Our support email address (`soporte@projectxeventos.es`) with a 48-hour response SLA.
- Company identity (JV Group Premium Events & Business S.L., Madrid, Spain).
- A FAQ that covers the most common issues: login problems, where to find tickets/QR codes, how to delete an account, what to do if the scanner camera does not work, and how to escalate event-specific issues.
- Links to the Privacy Policy, Terms of Service, and Delete Account page.

The same support link is also reachable from the bottom of the login screen, so that even unauthenticated users can get help before signing in.

---

### Summary of changes between 1.0 (8) and 1.0 (10)

| Change | Guideline | Location |
|---|---|---|
| Added `NSCameraUsageDescription` + `NSPhotoLibraryUsageDescription` to Info.plist | 2.1(a) | Native |
| Scanner shows a user-friendly error banner if camera access fails | 2.1(a) | Web (Capacitor loads remote) |
| Admin header user-icon is now a tappable link to `/profile` | 2.1(a) / 5.1.1(v) | Web |
| Public `/support` page published with contact info + FAQ | 1.5 | Web |
| Added footer links to `/support` and `/delete-account` on the login screen | 1.5 / 5.1.1(v) | Web |

Please let us know if anything else is needed to continue the review. Thank you again for your time and patience.

Best regards,
Project X / JV Group Premium Events & Business S.L.
