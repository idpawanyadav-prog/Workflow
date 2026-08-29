"""Demo workflows with titles, short/long docs, dummy URLs, and a linked subflow."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

ID_ONBOARDING = "11111111-1111-4111-8111-111111111111"
ID_IT_PROVISION = "22222222-2222-4222-8222-222222222222"
ID_ORDER = "33333333-3333-4333-8333-333333333333"
ID_INCIDENT = "44444444-4444-4444-8444-444444444444"

SAMPLE_IDS = {ID_ONBOARDING, ID_IT_PROVISION, ID_ORDER, ID_INCIDENT}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _node(nid: str, ntype: str, title: str, x: float, y: float, short: str, long: str,
          links: list[dict] | None = None, **extra: Any) -> dict:
    node: dict[str, Any] = {
        "id": nid,
        "type": ntype,
        "title": title,
        "shortDescription": short,
        "detailedDescription": long,
        "position": {"x": x, "y": y},
        "attachments": [],
        "links": links or [],
    }
    node.update(extra)
    return node


def _conn(cid: str, source: str, source_dir: str, target: str, target_dir: str, label: str = "") -> dict:
    return {
        "id": cid,
        "source": source,
        "sourceDir": source_dir,
        "target": target,
        "targetDir": target_dir,
        "label": label,
    }


def _link(lid: str, url: str, label: str, group: str = "") -> dict:
    return {"id": lid, "url": url, "label": label, "group": group}


def _html(*paragraphs: str) -> str:
    return "".join(f"<p>{p}</p>" for p in paragraphs)


def it_provisioning_graph() -> dict:
    return {
        "nodes": [
            _node(
                "it-start", "start", "Ticket opened", 385, 40,
                "A new-hire access request lands in the IT queue.",
                _html(
                    "An <strong>access request</strong> is created automatically when HR marks the hire as confirmed.",
                    "The ticket includes legal name, start date, department, manager, and the equipment bundle from the offer letter.",
                    "Queue: <em>IT-ONBOARD</em>. SLA to first touch is 4 business hours.",
                ),
                [
                    _link("it-l1", "https://tickets.acme.test/queues/IT-ONBOARD", "IT-ONBOARD queue", "Tickets"),
                    _link("it-l2", "https://docs.acme.test/it/new-hire-intake", "Intake playbook", "Docs"),
                ],
            ),
            _node(
                "it-approve", "process", "Verify manager approval", 370, 180,
                "Confirm the hiring manager signed off on the access bundle.",
                _html(
                    "Check that the manager approved both <strong>SSO</strong> and any privileged roles.",
                    "If the bundle includes production access, a second approver from Security is required.",
                    "Record the approval IDs on the ticket before creating accounts.",
                ),
                [
                    _link("it-l3", "https://approvals.acme.test/bundles", "Access bundles", "Tools"),
                    _link("it-l4", "https://wiki.acme.test/security/privileged-access", "Privileged access policy", "Docs"),
                ],
            ),
            _node(
                "it-sso", "api", "Create SSO account", 370, 330,
                "Call identity provider to provision the corporate login.",
                _html(
                    "POST to the identity API with the employee ID as the unique subject.",
                    "Default groups: <code>all-staff</code>, department group, and office location.",
                    "Store the returned <strong>idp_user_id</strong> on the HRIS record.",
                ),
                [
                    _link("it-l5", "https://idp.acme.test/admin/users", "IdP admin", "Tools"),
                    _link("it-l6", "https://api.acme.test/identity/v2/docs", "Identity API docs", "API"),
                ],
            ),
            _node(
                "it-db", "database", "Grant role memberships", 370, 480,
                "Write group memberships and app entitlements to the access catalog.",
                _html(
                    "Insert rows into <code>access_catalog.memberships</code> for each approved application.",
                    "Engineering hires also receive GitHub org invite and staging VPN.",
                    "Do not grant production deploy roles on day one.",
                ),
                [
                    _link("it-l7", "https://catalog.acme.test/roles", "Role catalog", "Tools"),
                    _link("it-l8", "https://db.acme.test/console/access_catalog", "Catalog console", "Database"),
                ],
            ),
            _node(
                "it-mail", "email", "Send credentials kit", 370, 630,
                "Email a first-login link to the personal address on file.",
                _html(
                    "Send the <strong>Day-0 credentials kit</strong>: password reset link (24h expiry), MFA setup guide, and laptop pickup slot.",
                    "Never put raw passwords in the email body.",
                    "CC the hiring manager and the IT-ONBOARD ticket.",
                ),
                [
                    _link("it-l9", "https://mail.acme.test/templates/day0-kit", "Day-0 email template", "Email"),
                    _link("it-l10", "https://help.acme.test/mfa-setup", "MFA setup guide", "Docs"),
                ],
            ),
            _node(
                "it-wait", "delay", "24h access review", 370, 780,
                "Pause so Security can spot-check the new entitlements.",
                _html(
                    "Hold the ticket in <em>Pending review</em> for 24 hours.",
                    "If Security flags a role, roll it back before the start date.",
                    "Auto-resume when the review timer expires with no comments.",
                ),
                [_link("it-l11", "https://sec.acme.test/reviews/new-hires", "New-hire review queue", "Security")],
            ),
            _node(
                "it-end", "end", "Access live", 385, 930,
                "Accounts are ready for the employee start date.",
                _html(
                    "Mark the ticket resolved and notify HR that IT provisioning is complete.",
                    "Laptop shipping tracking is attached to the same ticket.",
                ),
                [_link("it-l12", "https://tickets.acme.test/status/resolved", "Resolved tickets", "Tickets")],
            ),
        ],
        "connections": [
            _conn("it-c1", "it-start", "bottom", "it-approve", "top"),
            _conn("it-c2", "it-approve", "bottom", "it-sso", "top"),
            _conn("it-c3", "it-sso", "bottom", "it-db", "top"),
            _conn("it-c4", "it-db", "bottom", "it-mail", "top"),
            _conn("it-c5", "it-mail", "bottom", "it-wait", "top"),
            _conn("it-c6", "it-wait", "bottom", "it-end", "top"),
        ],
    }


def _it_counts() -> tuple[int, int]:
    g = it_provisioning_graph()
    return len(g["nodes"]), len(g["connections"])


def onboarding_graph() -> dict:
    n_nodes, n_links = _it_counts()
    return {
        "nodes": [
            _node(
                "onb-start", "start", "Offer accepted", 445, 40,
                "Candidate signs the offer and HR opens an onboarding case.",
                _html(
                    "Triggered when the candidate e-signs the offer in the ATS.",
                    "HR creates an onboarding case with start date, manager, location, and equipment notes.",
                    "This is the <strong>source of truth</strong> for every downstream team.",
                ),
                [
                    _link("onb-l1", "https://ats.acme.test/offers", "ATS offers", "HR"),
                    _link("onb-l2", "https://docs.acme.test/hr/onboarding-overview", "Onboarding overview", "Docs"),
                ],
            ),
            _node(
                "onb-paper", "process", "Collect paperwork", 430, 180,
                "Gather tax forms, ID, and emergency contacts.",
                _html(
                    "Send the new-hire packet: W-4 / local tax, direct deposit, emergency contacts, and handbook acknowledgement.",
                    "International hires also complete right-to-work verification.",
                    "Block IT provisioning until identity documents are verified.",
                ),
                [
                    _link("onb-l3", "https://hris.acme.test/packets/new-hire", "New-hire packet", "HR"),
                    _link("onb-l4", "https://forms.acme.test/i9", "I-9 portal", "Compliance"),
                ],
            ),
            _node(
                "onb-docs", "document", "Sign handbook & policies", 430, 330,
                "Employee acknowledges handbook, code of conduct, and IT policy.",
                _html(
                    "The packet includes the employee handbook, code of conduct, acceptable-use policy, and confidentiality agreement.",
                    "E-sign events are stored on the HRIS profile and copied to the compliance archive.",
                ),
                [
                    _link("onb-l5", "https://docs.acme.test/handbook.pdf", "Employee handbook (PDF)", "Docs"),
                    _link("onb-l6", "https://docs.acme.test/policies/aup", "Acceptable use policy", "Docs"),
                    _link("onb-l7", "https://sign.acme.test/envelopes", "E-sign envelopes", "Tools"),
                ],
            ),
            _node(
                "onb-hris", "database", "Create HR record", 430, 480,
                "Insert the employee master record and assign an employee ID.",
                _html(
                    "Create the person in HRIS with status <code>pre-start</code>.",
                    "The generated employee ID is the key used by payroll, IT, and badge printing.",
                    "Set probation end date to start date + 90 days.",
                ),
                [
                    _link("onb-l8", "https://hris.acme.test/people/new", "Create person", "HR"),
                    _link("onb-l9", "https://db.acme.test/console/hris", "HRIS console", "Database"),
                ],
            ),
            _node(
                "onb-it", "subflow", "Provision IT accounts", 430, 630,
                "Run the IT account provisioning workflow as a nested flow.",
                _html(
                    "Hands off to the dedicated IT provisioning flow: SSO, roles, credentials kit, and Security review.",
                    "Use <strong>Play inside</strong> during a walkthrough to step through that nested chart.",
                    "HR waits here until IT marks access live.",
                ),
                [
                    _link("onb-l10", "https://docs.acme.test/it/provisioning", "Provisioning runbook", "Docs"),
                ],
                subflow={
                    "projectId": ID_IT_PROVISION,
                    "name": "IT Account Provisioning",
                    "description": "SSO, roles, credentials kit, and a 24-hour security review for new hires.",
                    "nodeCount": n_nodes,
                    "connectionCount": n_links,
                },
            ),
            _node(
                "onb-bg", "decision", "Background check clear?", 445, 790,
                "Branch on the background-check result from the vendor.",
                _html(
                    "The screening vendor posts a result of <strong>Clear</strong>, <strong>Consider</strong>, or <strong>Fail</strong>.",
                    "Only Clear continues to the welcome path. Consider and Fail both escalate to People Ops.",
                    "Do not discuss details with the hiring manager until People Ops advises.",
                ),
                [
                    _link("onb-l11", "https://screening.example.com/dashboard", "Screening dashboard", "Vendor"),
                    _link("onb-l12", "https://docs.acme.test/hr/background-checks", "BG check policy", "Docs"),
                ],
            ),
            _node(
                "onb-welcome", "email", "Send welcome email", 180, 1040,
                "Warm welcome with start-date logistics and buddy intro.",
                _html(
                    "Send the welcome sequence: start time, office map or remote kit, buddy name, and first-week calendar.",
                    "Include a link to the new-hire Slack channel.",
                ),
                [
                    _link("onb-l13", "https://mail.acme.test/templates/welcome", "Welcome template", "Email"),
                    _link("onb-l14", "https://acme.slack.test/archives/C-NEWHIRES", "New-hire channel", "Chat"),
                ],
            ),
            _node(
                "onb-wait", "delay", "Wait for start date", 180, 1190,
                "Hold until the employee's first day.",
                _html(
                    "The case sleeps until 08:00 local time on the start date.",
                    "If the start date moves, HR updates the case and this timer resets.",
                ),
                [_link("onb-l15", "https://hris.acme.test/start-dates", "Start date calendar", "HR")],
            ),
            _node(
                "onb-orient", "process", "First-day orientation", 180, 1340,
                "Badge, desk or remote setup, and team intro.",
                _html(
                    "In-office: badge photo, building walkthrough, and laptop handoff.",
                    "Remote: video orientation, equipment unboxing checklist, and calendar holds with the manager and buddy.",
                    "Capture a photo for the directory (optional).",
                ),
                [
                    _link("onb-l16", "https://docs.acme.test/hr/first-day", "First-day checklist", "Docs"),
                    _link("onb-l17", "https://facilities.acme.test/badges", "Badge request", "Facilities"),
                ],
            ),
            _node(
                "onb-done", "end", "Onboarded", 195, 1490,
                "Employee is active in payroll, IT, and the directory.",
                _html(
                    "Flip HRIS status to <code>active</code> and close the onboarding case.",
                    "Schedule the 30/60/90 check-ins on the manager's calendar.",
                ),
                [_link("onb-l18", "https://hris.acme.test/cases", "Onboarding cases", "HR")],
            ),
            _node(
                "onb-escalate", "email", "Escalate to People Ops", 700, 1040,
                "Background check needs a human decision.",
                _html(
                    "Notify People Ops with the vendor case ID only — do not attach the report to email.",
                    "Hiring manager is told the start may slip, without screening details.",
                ),
                [
                    _link("onb-l19", "https://mail.acme.test/templates/bg-escalate", "Escalation template", "Email"),
                    _link("onb-l20", "https://people.acme.test/ops/queue", "People Ops queue", "HR"),
                ],
            ),
            _node(
                "onb-paused", "end", "Onboarding paused", 715, 1190,
                "Case parked until People Ops resolves the screening outcome.",
                _html(
                    "IT accounts stay in <code>pre-start</code> and are not activated.",
                    "Resume from Collect paperwork if the candidate is cleared later.",
                ),
                [_link("onb-l21", "https://docs.acme.test/hr/pause-onboarding", "Pause procedure", "Docs")],
            ),
        ],
        "connections": [
            _conn("onb-c1", "onb-start", "bottom", "onb-paper", "top"),
            _conn("onb-c2", "onb-paper", "bottom", "onb-docs", "top"),
            _conn("onb-c3", "onb-docs", "bottom", "onb-hris", "top"),
            _conn("onb-c4", "onb-hris", "bottom", "onb-it", "top"),
            _conn("onb-c5", "onb-it", "bottom", "onb-bg", "top"),
            _conn("onb-c6", "onb-bg", "bottom", "onb-welcome", "top", "Yes"),
            _conn("onb-c7", "onb-bg", "right", "onb-escalate", "top", "No"),
            _conn("onb-c8", "onb-welcome", "bottom", "onb-wait", "top"),
            _conn("onb-c9", "onb-wait", "bottom", "onb-orient", "top"),
            _conn("onb-c10", "onb-orient", "bottom", "onb-done", "top"),
            _conn("onb-c11", "onb-escalate", "bottom", "onb-paused", "top"),
        ],
    }


def order_fulfillment_graph() -> dict:
    return {
        "nodes": [
            _node(
                "ord-start", "start", "Order placed", 445, 40,
                "Checkout completed and an order ID is issued.",
                _html(
                    "The storefront emits <code>order.placed</code> with line items, shipping address, and payment intent.",
                    "Fraud pre-score is attached but not blocking at this step.",
                ),
                [
                    _link("ord-l1", "https://shop.example.com/admin/orders", "Orders admin", "Store"),
                    _link("ord-l2", "https://api.shop.example.com/v1/orders", "Orders API", "API"),
                ],
            ),
            _node(
                "ord-pay", "api", "Authorize payment", 430, 180,
                "Place a hold on the customer's card for the order total.",
                _html(
                    "Call the payments provider to <strong>authorize</strong> (not capture) the amount plus estimated tax and shipping.",
                    "On decline, the order is cancelled upstream and never reaches this chart.",
                    "Save <code>payment_intent_id</code> on the order row.",
                ),
                [
                    _link("ord-l3", "https://payments.example.com/dashboard", "Payments dashboard", "Payments"),
                    _link("ord-l4", "https://docs.payments.example.com/authorize", "Authorize API", "API"),
                ],
            ),
            _node(
                "ord-stock", "database", "Check inventory", 430, 330,
                "Read ATP (available to promise) for every SKU.",
                _html(
                    "Query the warehouse ATP table with a row lock on each SKU.",
                    "Kits explode into component SKUs before the check.",
                    "If any line is short, the whole order takes the backorder path.",
                ),
                [
                    _link("ord-l5", "https://wms.example.com/atp", "ATP console", "Warehouse"),
                    _link("ord-l6", "https://db.example.com/inventory", "Inventory DB", "Database"),
                ],
            ),
            _node(
                "ord-dec", "decision", "In stock?", 445, 480,
                "Yes if every line can ship from the assigned warehouse.",
                _html(
                    "Yes: reserve stock and continue to pick.",
                    "No: notify the customer and wait for replenishment. Partial ship is out of scope in this sample.",
                ),
                [_link("ord-l7", "https://docs.example.com/fulfillment/atp-rules", "ATP rules", "Docs")],
            ),
            _node(
                "ord-pick", "process", "Pick and pack", 180, 730,
                "Warehouse picks the carton and prints the label.",
                _html(
                    "WMS creates a pick wave. Packers scan each unit and apply the carrier label.",
                    "Hazmat and lithium SKUs use the overlay packing SOP.",
                ),
                [
                    _link("ord-l8", "https://wms.example.com/waves", "Pick waves", "Warehouse"),
                    _link("ord-l9", "https://docs.example.com/sop/pack", "Packing SOP", "Docs"),
                ],
            ),
            _node(
                "ord-ship-mail", "email", "Send shipping confirmation", 180, 880,
                "Email tracking number and delivery window.",
                _html(
                    "Template includes carrier, tracking URL, and a returns portal link.",
                    "SMS is sent when the customer opted in at checkout.",
                ),
                [
                    _link("ord-l10", "https://mail.example.com/templates/shipped", "Shipped template", "Email"),
                    _link("ord-l11", "https://track.example.com", "Tracking portal", "Carrier"),
                ],
            ),
            _node(
                "ord-capture", "api", "Capture payment", 180, 1030,
                "Capture the authorized amount once the label is created.",
                _html(
                    "Capture may be less than authorized if items were short-shipped by exception.",
                    "Failures retry three times, then page Payments on-call.",
                ),
                [_link("ord-l12", "https://docs.payments.example.com/capture", "Capture API", "API")],
            ),
            _node(
                "ord-shipped", "end", "Order shipped", 195, 1180,
                "Order is in transit; customer has tracking.",
                _html(
                    "Status becomes <code>shipped</code>. Returns window starts on delivery scan.",
                ),
                [_link("ord-l13", "https://shop.example.com/admin/orders?status=shipped", "Shipped orders", "Store")],
            ),
            _node(
                "ord-back", "email", "Send backorder notice", 700, 730,
                "Tell the customer which SKUs are waiting on stock.",
                _html(
                    "Include expected restock date from the purchasing calendar.",
                    "Offer cancel-and-refund if the wait exceeds 10 days.",
                ),
                [
                    _link("ord-l14", "https://mail.example.com/templates/backorder", "Backorder template", "Email"),
                    _link("ord-l15", "https://purchasing.example.com/calendar", "Restock calendar", "Purchasing"),
                ],
            ),
            _node(
                "ord-wait", "delay", "Wait for restock", 700, 880,
                "Park the order until inbound inventory is received.",
                _html(
                    "Subscribe to <code>asn.received</code> for the missing SKUs.",
                    "If the customer cancels during the wait, release the payment hold.",
                ),
                [_link("ord-l16", "https://wms.example.com/inbound", "Inbound ASN", "Warehouse")],
            ),
            _node(
                "ord-alloc", "process", "Allocate stock", 700, 1030,
                "Reserve the newly received units against this order.",
                _html(
                    "FIFO against other backorders with the same SKU.",
                    "Then join the pick path as if the order had been in stock.",
                ),
                [_link("ord-l17", "https://wms.example.com/allocations", "Allocations", "Warehouse")],
            ),
        ],
        "connections": [
            _conn("ord-c1", "ord-start", "bottom", "ord-pay", "top"),
            _conn("ord-c2", "ord-pay", "bottom", "ord-stock", "top"),
            _conn("ord-c3", "ord-stock", "bottom", "ord-dec", "top"),
            _conn("ord-c4", "ord-dec", "bottom", "ord-pick", "top", "Yes"),
            _conn("ord-c5", "ord-dec", "right", "ord-back", "top", "No"),
            _conn("ord-c6", "ord-pick", "bottom", "ord-ship-mail", "top"),
            _conn("ord-c7", "ord-ship-mail", "bottom", "ord-capture", "top"),
            _conn("ord-c8", "ord-capture", "bottom", "ord-shipped", "top"),
            _conn("ord-c9", "ord-back", "bottom", "ord-wait", "top"),
            _conn("ord-c10", "ord-wait", "bottom", "ord-alloc", "top"),
            _conn("ord-c11", "ord-alloc", "left", "ord-pick", "right"),
        ],
    }


def incident_response_graph() -> dict:
    return {
        "nodes": [
            _node(
                "inc-start", "start", "Alert received", 445, 40,
                "Paging or monitoring fires a production alert.",
                _html(
                    "Sources include Prometheus, uptime checks, and customer-reported Sev-1 tickets.",
                    "The alert payload includes service, error budget burn, and runbook URL.",
                ),
                [
                    _link("inc-l1", "https://alerts.example.net/active", "Active alerts", "Monitoring"),
                    _link("inc-l2", "https://status.example.net", "Public status page", "Status"),
                ],
            ),
            _node(
                "inc-triage", "process", "Triage severity", 430, 180,
                "On-call classifies P1–P4 from impact and blast radius.",
                _html(
                    "<strong>P1</strong>: customer-facing outage or data risk.",
                    "P2: major degradation. P3/P4 go to the ticket queue instead of a war room.",
                    "When unsure, start one severity higher and downgrade later.",
                ),
                [
                    _link("inc-l3", "https://docs.example.net/sre/severity", "Severity rubric", "Docs"),
                    _link("inc-l4", "https://oncall.example.net/schedule", "On-call schedule", "SRE"),
                ],
            ),
            _node(
                "inc-dec", "decision", "Production down?", 445, 330,
                "Yes for P1 customer-facing or data-loss incidents.",
                _html(
                    "Yes opens a war room and pages secondary on-call.",
                    "No files a ticket and follows the standard SLA clock.",
                ),
                [_link("inc-l5", "https://docs.example.net/sre/p1-criteria", "P1 criteria", "Docs")],
            ),
            _node(
                "inc-page", "email", "Page on-call + stakeholders", 180, 560,
                "Fan-out to primary, secondary, and the service owner.",
                _html(
                    "PagerDuty + Slack #incidents. Include alert fingerprint and a Zoom bridge.",
                    "Comms lead is assigned if the incident is still open after 15 minutes.",
                ),
                [
                    _link("inc-l6", "https://pager.example.net/incidents", "PagerDuty", "Paging"),
                    _link("inc-l7", "https://acme.slack.test/archives/C-INCIDENTS", "#incidents", "Chat"),
                ],
            ),
            _node(
                "inc-room", "api", "Open war room", 180, 710,
                "Create the incident record, Slack channel, and Zoom.",
                _html(
                    "POST to the incident commander API. Channel name follows <code>inc-YYYYMMDD-service</code>.",
                    "Status page stays empty until a human publishes the first update.",
                ),
                [
                    _link("inc-l8", "https://incidents.example.net/new", "Incident commander", "Tools"),
                    _link("inc-l9", "https://api.incidents.example.net/v1", "Incidents API", "API"),
                ],
            ),
            _node(
                "inc-fix", "process", "Mitigate impact", 180, 860,
                "Rollback, feature-flag, or scale — restore service first.",
                _html(
                    "Prefer rollback over hot-patch unless data is at risk.",
                    "Capture a timeline in the incident doc as you go; do not wait for the postmortem.",
                ),
                [
                    _link("inc-l10", "https://deploy.example.net", "Deploy console", "Tools"),
                    _link("inc-l11", "https://flags.example.net", "Feature flags", "Tools"),
                    _link("inc-l12", "https://docs.example.net/sre/mitigation", "Mitigation playbook", "Docs"),
                ],
            ),
            _node(
                "inc-pm", "document", "Write postmortem", 180, 1010,
                "Blameless write-up within 3 business days of resolve.",
                _html(
                    "Template: summary, impact, timeline, root cause, what went well, action items with owners.",
                    "Link the Grafana snapshot and the deploy that caused or fixed the issue.",
                ),
                [
                    _link("inc-l13", "https://docs.example.net/sre/postmortem-template", "PM template", "Docs"),
                    _link("inc-l14", "https://wiki.example.net/incidents", "Incident wiki", "Docs"),
                ],
            ),
            _node(
                "inc-closed", "end", "Incident closed", 195, 1160,
                "Customer impact gone and follow-ups tracked.",
                _html(
                    "Resolve the PD incident, archive the Slack channel after 7 days, and file action items in the tracker.",
                ),
                [_link("inc-l15", "https://tracker.example.net/projects/SRE", "SRE tracker", "Tools")],
            ),
            _node(
                "inc-ticket", "process", "File ticket", 700, 560,
                "Non-P1 work goes to the service team's backlog.",
                _html(
                    "Create a Jira in the owning team's project with alert payload, dashboard links, and first diagnosis.",
                    "Set priority from the severity rubric.",
                ),
                [
                    _link("inc-l16", "https://jira.example.net/browse/OPS", "OPS project", "Tickets"),
                    _link("inc-l17", "https://grafana.example.net", "Grafana", "Monitoring"),
                ],
            ),
            _node(
                "inc-sla", "delay", "SLA timer", 700, 710,
                "Wait for the team SLA before escalating.",
                _html(
                    "P2: 4 hours. P3: next business day. P4: best effort.",
                    "If the timer fires with no progress, escalate to the team lead.",
                ),
                [_link("inc-l18", "https://docs.example.net/sre/sla", "Response SLAs", "Docs")],
            ),
            _node(
                "inc-invest", "process", "Investigate", 700, 860,
                "Reproduce, find owner, and ship a fix or workaround.",
                _html(
                    "Use logs, traces, and recent deploys. If it later meets P1 criteria, jump to the war-room path.",
                ),
                [
                    _link("inc-l19", "https://logs.example.net", "Log search", "Monitoring"),
                    _link("inc-l20", "https://trace.example.net", "Traces", "Monitoring"),
                ],
            ),
            _node(
                "inc-notes", "document", "Resolution notes", 700, 1010,
                "Short write-up so the next on-call is not starting from zero.",
                _html(
                    "Even non-P1 issues get a paragraph: cause, fix, dashboards used, and whether monitoring should change.",
                ),
                [_link("inc-l21", "https://wiki.example.net/runbooks", "Runbooks", "Docs")],
            ),
            _node(
                "inc-done", "end", "Ticket done", 715, 1160,
                "Backlog item resolved; alert should be quiet.",
                _html(
                    "Close the ticket and confirm the original alert is not still firing.",
                ),
                [_link("inc-l22", "https://alerts.example.net/silences", "Alert silences", "Monitoring")],
            ),
        ],
        "connections": [
            _conn("inc-c1", "inc-start", "bottom", "inc-triage", "top"),
            _conn("inc-c2", "inc-triage", "bottom", "inc-dec", "top"),
            _conn("inc-c3", "inc-dec", "bottom", "inc-page", "top", "Yes"),
            _conn("inc-c4", "inc-dec", "right", "inc-ticket", "top", "No"),
            _conn("inc-c5", "inc-page", "bottom", "inc-room", "top"),
            _conn("inc-c6", "inc-room", "bottom", "inc-fix", "top"),
            _conn("inc-c7", "inc-fix", "bottom", "inc-pm", "top"),
            _conn("inc-c8", "inc-pm", "bottom", "inc-closed", "top"),
            _conn("inc-c9", "inc-ticket", "bottom", "inc-sla", "top"),
            _conn("inc-c10", "inc-sla", "bottom", "inc-invest", "top"),
            _conn("inc-c11", "inc-invest", "bottom", "inc-notes", "top"),
            _conn("inc-c12", "inc-notes", "bottom", "inc-done", "top"),
        ],
    }


def sample_project_docs() -> list[dict]:
    ts = _now()
    return [
        {
            "id": ID_ONBOARDING,
            "name": "Employee Onboarding",
            "description": "From signed offer to first day: paperwork, HRIS, IT subflow, and a background-check branch.",
            "createdAt": ts,
            "updatedAt": ts,
            "graph": onboarding_graph(),
        },
        {
            "id": ID_IT_PROVISION,
            "name": "IT Account Provisioning",
            "description": "SSO, role catalog, credentials kit, and a 24-hour security review. Linked from Employee Onboarding.",
            "createdAt": ts,
            "updatedAt": ts,
            "graph": it_provisioning_graph(),
        },
        {
            "id": ID_ORDER,
            "name": "Order Fulfillment",
            "description": "Authorize payment, check ATP, then pick/pack or backorder until stock returns.",
            "createdAt": ts,
            "updatedAt": ts,
            "graph": order_fulfillment_graph(),
        },
        {
            "id": ID_INCIDENT,
            "name": "Incident Response",
            "description": "Triage to P1 war room or standard ticket SLA, then postmortem or resolution notes.",
            "createdAt": ts,
            "updatedAt": ts,
            "graph": incident_response_graph(),
        },
    ]


async def seed_sample_projects(storage, *, only_if_empty: bool = False) -> dict:
    existing = await storage.list()
    if only_if_empty and existing:
        return {"inserted": [], "skipped": [p["id"] for p in existing], "reason": "not_empty"}
    existing_ids = {p["id"] for p in existing}
    inserted: list[str] = []
    skipped: list[str] = []
    for doc in sample_project_docs():
        if doc["id"] in existing_ids:
            skipped.append(doc["id"])
            continue
        await storage.insert(copy.deepcopy(doc))
        inserted.append(doc["id"])
    return {"inserted": inserted, "skipped": skipped}
