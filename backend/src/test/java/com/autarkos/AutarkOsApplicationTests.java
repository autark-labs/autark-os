package com.autarkos;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "autark-os.runtime-root=build/test-runtime/application-context")
class AutarkOsApplicationTests {

    @Test
    void contextLoads() {
    }
}
