class IntegrationManager:

    def __init__(self):
        self.providers = {}

    def register(self, provider, implementation):
        self.providers[provider] = implementation

    def build(self, provider, **kwargs):

        if provider not in self.providers:
            raise ValueError(
                f"Unsupported provider: {provider}"
            )

        return self.providers[provider](**kwargs)
