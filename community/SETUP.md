# Arcade Atlas Community setup

The Community page supports multiple servers with live messages, channels, member lists, and owner/moderator/member roles. It is a static GitHub Pages front end connected to Supabase; shared chat does not work until Supabase is configured.

## 1. Create a Supabase project

Create a project at [supabase.com](https://supabase.com/). The Free plan is $0 and is intended to be enough for a group of 20–30, within its limits. Supabase currently lists 500 MB database storage, 5 GB egress, and 200 simultaneous Realtime connections on Free; check [current pricing and quotas](https://supabase.com/pricing) because they can change. Free projects can pause after a period of inactivity. This means service availability is not guaranteed. If a project pauses, its owner must resume it.

## 2. Enable guest sign-in

In the project dashboard, open **Authentication → Sign In / Providers** and enable **Anonymous sign-ins**. No email, phone, or real name is collected. A guest identity belongs to that browser. It will not transfer to another device, and clearing site data can permanently lose the identity and its server memberships. The Lock button keeps the browser identity so the same person can return.

Supabase applies rate limits to anonymous sign-ups. A whole school or friend group may share one public IP, so 20–30 people joining at once can hit the default limit. Check **Authentication → Rate Limits** before a group launch. Supabase recommends CAPTCHA/Turnstile against abuse; this page does not currently configure a CAPTCHA. Test with your group before relying on it.

## 3. Install the server tables and access rules

Open **SQL Editor → New query**. Copy all of [`setup.sql`](setup.sql) into the editor and run it. The script creates the server, membership, channel, invite, message, and report tables; enables row-level security; and adds server-side functions for creating/joining servers and managing roles.

If you ran an older Arcade Atlas chat setup, this script removes the old room tables' permissive policies and revokes their browser access. Existing old-room messages are left in the database but are no longer shown. Review the SQL before running it if those old tables contain anything you need.

### Add profile, role, and message features

If you already ran `setup.sql`, run [`upgrade.sql`](upgrade.sql) as a **second** SQL snippet. It is additive: it keeps your current servers and messages and adds profile fields, custom roles, reactions, pins, replies, and restricted Storage buckets for avatars and server attachments. Do not rerun `setup.sql` to get these new features.

Uploaded profile pictures use a public avatar bucket, so anyone with an image URL can view them. Chat attachments use a private bucket and require server membership. The avatar upload limit is 2 MB; attachment uploads are limited to 5 MB and supported file types. Supabase Storage usage counts toward your project quota.

## 4. Add the public browser settings

In **Project Settings → API**, copy the **Project URL** and **publishable key** (older dashboards may call it the `anon` key). Add them to [`../community-config.js`](../community-config.js):

```js
window.ARCADE_CHAT_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  publishableKey: 'YOUR-PUBLISHABLE-KEY'
};
```

The publishable key is designed for browser use. Never put a `service_role` or secret key in the website. Row-level security and the SQL functions enforce server membership and roles.

## 5. Create the first server and invite your group

Open Arcade Atlas Community, enter the casual site code `1122`, then choose **Create**. The creator becomes the owner, and the server starts with `general`, `game-talk`, and `help` channels. Under **Manage**, use **Create invite** and share the generated code privately with your group. Each invite supports up to 30 joins and expires after seven days. It is only displayed once; create a new invite if it is lost.

Owners can create colored custom roles, set their permission flags and order, assign them, remove members, add channels, create invites, and review/remove reported messages. Only the owner can create/edit/assign custom roles, which prevents delegated roles from granting powers above their authority. Moderators retain channel, invite, member-removal, pin, and moderation powers; custom roles can receive explicitly supported powers. Members can chat, reply, react, search, and report messages. Supabase enforces these permissions; hiding a button is only a user-interface aid.

## Privacy and costs

Messages, membership, roles, profile details, reactions, pins, reports, invite hashes, and uploaded files are stored in your Supabase project, not in the GitHub repository. Any member of a server can read that server's chat and roster. Avatar image URLs are public; private attachments are restricted to server members. Only users with the moderation permission can read reports. Supabase project administrators can access the project data. Users can delete their own messages; authorized moderators/owners can remove messages.

The website code `1122` is public and can be discovered. It is only a casual page gate. Server data is protected by membership rules, and invite codes are single-use per join, limited, expiring, and stored as hashes. This provides access control for a small friend group, not high-security private messaging. Do not share personal or sensitive information.

Online indicators use temporary Supabase Realtime Presence for the currently selected server. Unread badges are stored in that browser. Browser notifications are not implemented. Messages load in batches of 60, with a button to fetch earlier history. The composer includes a small built-in animated sticker set and can show image/GIF attachments inline; online GIF search would require a server-side proxy and provider key. Voice/video buttons are a labeled interface demo; there is no WebRTC signaling or live media connection.

Free usage has quotas and availability limits. Supabase can change its pricing, limits, or terms. The game site itself does not pay for or guarantee Supabase hosting, bandwidth, or uptime.

## 6. Publish to GitHub Pages

Upload the changed project files and folders to the repository root, including `community.html`, `community.css`, `community.js`, `community-config.js`, and the updated `community` folder. Commit the changes to `main` and wait for the Pages deployment to finish. Open `https://zico1503.github.io/community.html`.
