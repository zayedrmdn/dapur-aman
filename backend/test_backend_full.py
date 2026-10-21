"""End-to-end integration test for Dapur Aman Backend API.

Tests:
1. GET /health
2. POST /api/auth/login (invalid and valid credentials)
3. POST /api/vision/inspect (S3 upload + Vertex AI Vision + Neon DB persistence)
4. GET /api/batches/{batch_id} (retrieval of batch, findings, and fresh signed photo URL)
5. POST /api/actions (staff fix, supervisor hold, supervisor lift hold, batch close)
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.config import BACKEND_SHARED_SECRET


def run_tests():
    print("=" * 60)
    print("DAPUR AMAN - BACKEND END-TO-END TEST SUITE")
    print("=" * 60)

    # Use TestClient with lifespan context
    with TestClient(app) as client:
        # 1. Health check
        print("\n[TEST 1] GET /health")
        res = client.get("/health")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        print("  -> PASSED: Health check response:", res.json())

        # 2. Shared secret rejection
        print("\n[TEST 2] Missing or invalid X-Shared-Secret header")
        res = client.post(
            "/api/auth/login",
            json={"username": "staff1", "password": "password123"},
            headers={"X-Shared-Secret": "invalid_secret"},
        )
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("  -> PASSED: Successfully rejected invalid shared secret.")

        # 3. Auth login with wrong password
        print("\n[TEST 3] POST /api/auth/login with incorrect password")
        res = client.post(
            "/api/auth/login",
            json={"username": "staff1", "password": "wrong_password"},
            headers={"X-Shared-Secret": BACKEND_SHARED_SECRET},
        )
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("  -> PASSED: Rejected incorrect password.")

        # 4. Auth login with valid staff credentials
        print("\n[TEST 4] POST /api/auth/login with valid staff credentials")
        res = client.post(
            "/api/auth/login",
            json={"username": "staff1", "password": "password123"},
            headers={"X-Shared-Secret": BACKEND_SHARED_SECRET},
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        staff_data = res.json()
        assert staff_data["role"] == "kitchen_staff"
        staff_actor_id = staff_data["actor_id"]
        print(f"  -> PASSED: Logged in as staff: {staff_data['name']} (ID: {staff_actor_id})")

        # 5. Auth login with valid supervisor credentials
        print("\n[TEST 5] POST /api/auth/login with valid supervisor credentials")
        res = client.post(
            "/api/auth/login",
            json={"username": "supervisor1", "password": "password123"},
            headers={"X-Shared-Secret": BACKEND_SHARED_SECRET},
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        supervisor_data = res.json()
        assert supervisor_data["role"] == "supervisor"
        supervisor_actor_id = supervisor_data["actor_id"]
        print(f"  -> PASSED: Logged in as supervisor: {supervisor_data['name']} (ID: {supervisor_actor_id})")

        # 6. Vision inspection endpoint
        print("\n[TEST 6] POST /api/vision/inspect with real food tray image")
        img_path = Path("example_image/non-ideal.png")
        if not img_path.exists():
            img_path = Path("example_image/ideal.png")

        with open(img_path, "rb") as f:
            photo_bytes = f.read()

        files = {"photo": ("test_tray.png", photo_bytes, "image/png")}
        form_data = {
            "table_name": "Table 2",
            "menu_items": "Nasi putih, Ayam kecap, Tumis buncis, Tahu goreng, Anggur",
        }
        headers = {
            "X-Shared-Secret": BACKEND_SHARED_SECRET,
            "X-Actor-Id": staff_actor_id,
        }

        print("  Sending inspect request to Vision Agent (Gemini 3.8 Flash)...")
        res = client.post(
            "/api/vision/inspect",
            files=files,
            data=form_data,
            headers=headers,
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        inspect_data = res.json()

        batch_id = inspect_data.get("batch_id")
        run_id = inspect_data.get("run_id")
        photo_url = inspect_data.get("photo_url")
        findings = inspect_data.get("findings", [])
        components = inspect_data.get("detected_components", [])

        print(f"  -> PASSED: Inspect success!")
        print(f"     Batch ID: {batch_id}")
        print(f"     Run ID: {run_id}")
        print(f"     Photo Signed URL: {photo_url[:50]}...")
        print(f"     Headline: {inspect_data.get('headline')}")
        print(f"     Summary Label: {inspect_data.get('summary_label')}")
        print(f"     Status: {inspect_data.get('status')}")
        print(f"     Components count: {len(components)}")
        print(f"     Findings count: {len(findings)}")

        assert batch_id is not None, "batch_id must be returned"
        assert photo_url is not None and "http" in photo_url, "Valid presigned photo_url required"

        # 7. Batch detail retrieval
        print(f"\n[TEST 7] GET /api/batches/{batch_id}")
        res = client.get(
            f"/api/batches/{batch_id}",
            headers={"X-Shared-Secret": BACKEND_SHARED_SECRET},
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        batch_detail = res.json()
        assert batch_detail["batch_id"] == batch_id
        assert len(batch_detail["runs"]) > 0
        print(f"  -> PASSED: Batch reloaded from Neon DB with {len(batch_detail['findings'])} findings.")

        # 8. Human actions testing
        print("\n[TEST 8] Human Actions (Staff fix finding, Supervisor hold, Lift hold, Close)")
        first_finding_id = findings[0]["id"] if findings else None

        if first_finding_id:
            # 8a. Staff fixes finding
            print(f"  8a. Staff fixing finding: {first_finding_id}")
            res = client.post(
                "/api/actions",
                json={
                    "batch_id": batch_id,
                    "finding_id": first_finding_id,
                    "action": "fixed",
                    "reason": "Sudah mengganti ayam dengan potongan matang sempurna.",
                },
                headers={
                    "X-Shared-Secret": BACKEND_SHARED_SECRET,
                    "X-Actor-Id": staff_actor_id,
                },
            )
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            print("      -> Staff fix recorded successfully.")

            # Dismiss any other remaining findings so batch can be closed later
            for other_finding in findings[1:]:
                client.post(
                    "/api/actions",
                    json={
                        "batch_id": batch_id,
                        "finding_id": other_finding["id"],
                        "action": "dismissed",
                        "reason": "Sudah diperiksa visual oleh chef, aman.",
                    },
                    headers={
                        "X-Shared-Secret": BACKEND_SHARED_SECRET,
                        "X-Actor-Id": staff_actor_id,
                    },
                )

        # 8b. Staff tries on_hold (should fail: 403 Forbidden)
        print("  8b. Staff attempting supervisor-only on_hold (expecting 403 Forbidden)")
        res = client.post(
            "/api/actions",
            json={
                "batch_id": batch_id,
                "action": "on_hold",
                "reason": "Staff mencoba menahan baki.",
            },
            headers={
                "X-Shared-Secret": BACKEND_SHARED_SECRET,
                "X-Actor-Id": staff_actor_id,
            },
        )
        assert res.status_code == 403, f"Expected 403, got {res.status_code}"
        print("      -> Correctly forbidden for staff.")

        # 8c. Supervisor places on_hold
        print("  8c. Supervisor placing on_hold")
        res = client.post(
            "/api/actions",
            json={
                "batch_id": batch_id,
                "action": "on_hold",
                "reason": "Baki ditahan sementara untuk pengecekan sampel lab suhu baki.",
            },
            headers={
                "X-Shared-Secret": BACKEND_SHARED_SECRET,
                "X-Actor-Id": supervisor_actor_id,
            },
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        print("      -> Supervisor on_hold recorded successfully.")

        # 8d. Supervisor lifts hold
        print("  8d. Supervisor lifting hold")
        res = client.post(
            "/api/actions",
            json={
                "batch_id": batch_id,
                "action": "lift_hold",
                "reason": "Suhu baki terverifikasi 65 derajat C, aman.",
            },
            headers={
                "X-Shared-Secret": BACKEND_SHARED_SECRET,
                "X-Actor-Id": supervisor_actor_id,
            },
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        print("      -> Supervisor lift_hold recorded successfully.")

        # 8e. Close batch
        print("  8e. Closing batch")
        res = client.post(
            "/api/actions",
            json={
                "batch_id": batch_id,
                "action": "close",
                "reason": "Seluruh temuan selesai ditangani, baki siap didistribusikan.",
            },
            headers={
                "X-Shared-Secret": BACKEND_SHARED_SECRET,
                "X-Actor-Id": staff_actor_id,
            },
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        print("      -> Batch closed successfully.")

        # 9. Verify reload of batch after actions
        print(f"\n[TEST 9] Verifying batch reload after human actions")
        res = client.get(
            f"/api/batches/{batch_id}",
            headers={"X-Shared-Secret": BACKEND_SHARED_SECRET},
        )
        assert res.status_code == 200
        final_batch = res.json()
        assert final_batch["status"] == "closed"
        assert len(final_batch["actions"]) >= 2
        print(f"  -> PASSED: Batch status is 'closed', total recorded actions: {len(final_batch['actions'])}")

    print("\n" + "=" * 60)
    print("ALL INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
