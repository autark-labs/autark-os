package com.projectos.system;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SystemSupportServiceTests {

    @Test
    void redactsSecretsAndTailnetUrls() {
        SystemSupportService service = new SystemSupportService(null, null, null, command -> new SystemSupportService.CommandResult(0, ""));

        String redacted = service.redact("COUCHDB_PASSWORD=secret123 token: abc https://project.tail123.ts.net:5984 100.90.12.8 Authorization: Bearer abcdefghijklmnop {\"api_key\":\"json-secret\"}");

        assertThat(redacted)
                .doesNotContain("secret123")
                .doesNotContain("abc")
                .doesNotContain("project.tail123.ts.net")
                .doesNotContain("100.90.12.8")
                .doesNotContain("abcdefghijklmnop")
                .doesNotContain("json-secret")
                .contains("COUCHDB_PASSWORD=[redacted]")
                .contains("token: [redacted]")
                .contains("[tailnet-url-redacted]")
                .contains("[tailnet-ip-redacted]")
                .contains("Bearer [redacted]")
                .contains("\"api_key\":\"[redacted]\"");
    }
}
