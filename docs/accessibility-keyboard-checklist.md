# Keyboard and assistive technology smoke checklist

Run this checklist in a Chromium browser before a release, using a narrow viewport once and a desktop viewport once.

## Setup

- Start at `/setup` with an incomplete setup state.
- Use `Tab`, `Shift+Tab`, `Space`, and `Enter` only to name the device, choose private access and backup posture, select starter apps, and finish setup.
- Confirm each choice card has a visible focus ring, selected state is announced, validation errors are announced, and no mouse-only control is required.

## Discover and installation

- Use the search field and filter controls with the keyboard.
- Open an app’s setup flow, review the install plan, and close it with `Escape`.
- Confirm focus returns to the control that opened the dialog and the dialog’s title and summary are announced.

## My Apps

- Select a managed app from both Basic and Advanced views using `Tab` and `Enter`.
- Open and close management with the keyboard.
- While management is open, confirm the app list behind the panel cannot receive focus.
- Confirm `Open`, runtime controls, backup controls, and disabled-action explanations can be reached and understood without a mouse.

## Backups

- Switch between summary and list tabs using arrow keys.
- Open restore-point details with `Enter`, confirm focus remains inside the dialog, then press `Escape`.
- Confirm focus returns to the Details control and restore warnings are readable without relying on color.

## Access

- Move between access-zone tabs on a narrow screen with arrow keys.
- Open a service’s details using `Enter`, inspect local/private links, and change the security posture with the keyboard.
- Confirm pinned services say they are linked services and expose no misleading management controls.

## Final checks

- Run `yarn test:e2e` from `frontend`; it includes axe checks for setup, Home, My Apps, Discover, Access, Settings, and the backup dialog.
- With a screen reader, verify active job progress is announced once as it changes and action errors provide a next step.
