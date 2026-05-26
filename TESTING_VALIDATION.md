# Testing And Validation

Validation completed:

- `npm run typecheck`

Manual validation path:

1. Open a project with audio clips.
2. Open the bottom dock Intelligence tab.
3. Click Analyze.
4. Confirm scores and recommendations appear only after analysis.
5. Expand evidence chips on recommendations.
6. Apply a safe FX recommendation.
7. Reject a recommendation.
8. Save and reopen the project.
9. Confirm `project.studioIntelligence.current`, history, and memory are retained.
10. Export after applying mastering recommendations.

Recommended future tests:

- synthetic sine pitch accuracy fixture
- onset timing fixture
- clipped audio fixture
- stereo anti-correlation fixture
- large project stress fixture
- save/reload snapshot regression
