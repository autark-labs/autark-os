package com.autarkos.pro;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "autark-os.pro")
public class ProProperties {

    private boolean enabled = false;
    private String apiBaseUrl = "";
    private boolean mockMode = true;
    private int heartbeatTimeoutSeconds = 5;
    private int feedTimeoutSeconds = 5;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getApiBaseUrl() {
        return apiBaseUrl;
    }

    public void setApiBaseUrl(String apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl == null ? "" : apiBaseUrl.trim();
    }

    public boolean isMockMode() {
        return mockMode;
    }

    public void setMockMode(boolean mockMode) {
        this.mockMode = mockMode;
    }

    public int getHeartbeatTimeoutSeconds() {
        return heartbeatTimeoutSeconds;
    }

    public void setHeartbeatTimeoutSeconds(int heartbeatTimeoutSeconds) {
        this.heartbeatTimeoutSeconds = Math.max(1, heartbeatTimeoutSeconds);
    }

    public int getFeedTimeoutSeconds() {
        return feedTimeoutSeconds;
    }

    public void setFeedTimeoutSeconds(int feedTimeoutSeconds) {
        this.feedTimeoutSeconds = Math.max(1, feedTimeoutSeconds);
    }

    public boolean remoteApiConfigured() {
        return !mockMode && apiBaseUrl != null && !apiBaseUrl.isBlank();
    }
}
