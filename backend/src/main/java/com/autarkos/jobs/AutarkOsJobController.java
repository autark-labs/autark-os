package com.autarkos.jobs;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
public class AutarkOsJobController {

    private final AutarkOsJobService jobService;

    public AutarkOsJobController(AutarkOsJobService jobService) {
        this.jobService = jobService;
    }

    @GetMapping
    public List<AutarkOsJob> jobs() {
        return jobService.list();
    }

    @GetMapping("/{jobId}")
    public ResponseEntity<AutarkOsJob> job(@PathVariable String jobId) {
        return jobService.findById(jobId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{jobId}/cancel")
    public ResponseEntity<AutarkOsJob> cancel(@PathVariable String jobId) {
        return jobService.cancel(jobId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
