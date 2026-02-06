return {
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "github/copilot.vim",
    },
    cmd = { "CodeCompanion", "CodeCompanionChat" },
    keys = {
      {
        "<leader>ac",
        function()
          require("codecompanion").actions({})
        end,
        desc = "code companion actions",
        mode = { "n", "v" },
      },
      {
        "<leader>aa",
        function()
          require("codecompanion").toggle()
        end,
        desc = "toggle code companion chat",
        mode = { "n", "v" },
      },
      {
        "ga",
        "<cmd>CodeCompanionChat Add<cr>",
        mode = { "v" },
      },
    },
    opts = {
      extensions = {},
      interactions = {
        --[[ cmd = {
            adapter = "anthropic_with_bearer_token",
            model = "claude-3-5-sonnet-20241022",
          },
          inline = {
            adapter = "anthropic_with_bearer_token",
            model = "claude-3-5-sonnet-20241022",
          },
          chat = {
            adapter = "anthropic_with_bearer_token",
            model = "claude-3-5-sonnet-20241022",
          }, ]]
      },
      opts = {
        language = "Chinese",
      },
      adapters = {
        http = {},
        -- opts = {
        -- allow_insecure = true,
        -- proxy = "socks5://127.0.0.1:7890",
        -- },
      },
      prompt_library = {
        ["Commit concise"] = {
          interaction = "chat",
          description = "Generate a conventional commit message without long description.",
          opts = {
            alias = "commit-concise",
            auto_submit = true,
            adapter = {
              name = "copilot",
            },
          },
          prompts = {
            {
              role = "user",
              content = function()
                return string.format(
                  [[I want you to create a commit using a concise commit message that follows the conventional commit format. Make sure to:
1. Use only a header (no detailed description).
2. Choose the correct scope based on the changes.
3. Ensure the message is clear, relevant, and properly formatted.

Here is the diff:

```diff
%s
```]],
                  vim.fn.system("git diff --no-ext-diff --staged")
                )
              end,
              opts = {
                contains_code = true,
              },
            },
          },
        },
      },
    },
  },
  {
    "github/copilot.vim",
    cmd = "Copilot",
    event = "BufReadPost",
    init = function()
      vim.g.copilot_no_maps = true
      vim.g.copilot_proxy = "socks5://localhost:7890"
      vim.keymap.set("i", "<C-f>", 'copilot#Accept("\\<CR>")', {
        expr = true,
        replace_keycodes = false,
      })
      vim.g.copilot_no_tab_map = true
    end,
    config = function()
      -- Block the normal Copilot suggestions
      vim.api.nvim_create_augroup("github_copilot", { clear = true })
      vim.api.nvim_create_autocmd({ "FileType", "BufUnload" }, {
        group = "github_copilot",
        callback = function(args)
          vim.fn["copilot#On" .. args.event]()
        end,
      })
      vim.fn["copilot#OnFileType"]()
    end,
  },
}
