package com.autarkos.network.tailscale;

import java.util.List;

public record TailscaleConnectGuide(
        String headline,
        String summary,
        List<String> steps,
        String installUrl,
        String connectCommand,
        String advancedNote,
        String enrollmentUrl) {

    public static TailscaleConnectGuide defaults() {
        return new TailscaleConnectGuide(
                "Connect Autark-OS to Tailscale",
                "Start by adding this device to your tailnet. After that, Autark-OS can help publish private app links.",
                List.of(
                        "Create or sign in to a Tailscale account.",
                        "Install Tailscale on the Autark-OS host if it is not installed yet.",
                        "Run the connect command on this host and approve the login in your browser.",
                        "Enable MagicDNS and HTTPS certificates in the DNS settings of the Tailscale admin console.",
                        "Return to Access and refresh to check this host and its private app links."),
                "https://tailscale.com/download",
                "tailscale up",
                "Run this command on the Autark-OS host, not on the phone or laptop used to view this guide.",
                null);
    }
}
