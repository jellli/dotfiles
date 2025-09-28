return {
  "olimorris/codecompanion.nvim",
  keys = {
    { "<leader>aa", mode = { "n", "v" }, "<cmd>CodeCompanionChat Toggle<cr>" },
  },
  opts = {
    strategies = {
      chat = { adapter = "claude_code" },
      inline = { adapter = "claude_code" },
    },
    adapters = {
      acp = {
        claude_code = function()
          return require("codecompanion.adapters").extend("claude_code", {
            env = {
              "CLAUDE_CODE_OAUTH_TOKEN",
            },
          })
        end,
      },
    },
  },
  dependencies = {
    "nvim-lua/plenary.nvim",
  },
}
