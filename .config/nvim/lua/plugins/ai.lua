return {
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "ravitemer/mcphub.nvim",
      -- "echasnovski/mini.diff",
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
      extensions = {
        mcphub = {
          callback = "mcphub.extensions.codecompanion",
          opts = {
            make_vars = true,
            make_slash_commands = true,
            show_result_in_chat = true,
          },
        },
      },
      strategies = {
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
        -- http = {
        --   copilot = function()
        --     return require("codecompanion.adapters").extend("copilot", {
        --       schema = {
        --         model = {
        --           default = "claude-sonnet-4.5",
        --         },
        --       },
        --     })
        --   end,
        -- },
        -- opts = {
        -- allow_insecure = true,
        -- proxy = "socks5://127.0.0.1:7890",
        -- },
      },
      prompt_library = {
        ["Commit concise"] = {
          strategy = "chat",
          description = "Generate a conventional commit message without long description.",
          opts = {
            short_name = "commit-concise",
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
                  [[I want you to use the @{cmd_runner} tool to create a commit using a concise commit message that follows the conventional commit format. Make sure to:
1. Use only a header (no detailed description).
2. Choose the correct scope based on the changes.
3. Ensure the message is clear, relevant, and properly formatted.
4. DO NOT run git add, as all the changes is provided and already staged.

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

    "ravitemer/mcphub.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    cmd = "MCPHub",
    -- build = "bundled_build.lua",
    config = function()
      require("mcphub").setup({
        -- use_bundled_binary = true,
        auto_approve = true,
        codecompanion = {
          show_result_in_chat = true,
          make_vars = true,
        },
      })
    end,
  },
  -- {
  --   "echasnovski/mini.diff",
  --   config = function()
  --     local diff = require("mini.diff")
  --     diff.setup({
  --       -- Disabled by default
  --       source = diff.gen_source.none(),
  --     })
  --   end,
  -- },
  {
    "MeanderingProgrammer/render-markdown.nvim",
    ft = { "markdown", "codecompanion" },
    opts = {
      render_modes = true,
      sign = {
        enabled = false,
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
