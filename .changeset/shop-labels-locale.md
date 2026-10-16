---
"@easy-cms/plugin-ecommerce": patch
---

Payment methods are named in the page's language: `GET <api>/shop/config?locale=th` (the shop client sends its `locale`) gives `โอนเงิน` instead of `Bank transfer`. Found testing the shop end to end with Stripe in test mode (#69).
