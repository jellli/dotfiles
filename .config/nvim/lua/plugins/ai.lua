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
    config = function(_, opts)
      require("codecompanion").setup(opts)

      local request_status = { processing = false, spinner_index = 1 }
      local spinner_symbols = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }
      local spinner_len = 10
      local spinner_timer = nil
      local function start_spinner()
        if spinner_timer then
          return
        end
        spinner_timer = vim.fn.timer_start(100, function()
          if request_status.processing then
            request_status.spinner_index = (request_status.spinner_index % spinner_len) + 1
            vim.cmd("redrawstatus")
          else
            vim.fn.timer_stop(spinner_timer)
            spinner_timer = nil
          end
        end, { ["repeat"] = -1 })
      end

      local function stop_spinner()
        if spinner_timer then
          vim.fn.timer_stop(spinner_timer)
          spinner_timer = nil
        end
        request_status.spinner_index = 1
      end

      local status_group = vim.api.nvim_create_augroup("CodeCompanionRequestStatus", { clear = true })
      vim.api.nvim_create_autocmd({ "User" }, {
        group = status_group,
        pattern = "CodeCompanionRequestStarted",
        callback = function()
          request_status.processing = true
          request_status.spinner_index = 1
          start_spinner()
          vim.cmd("redrawstatus")
          vim.api.nvim_echo({ { "[AI] Started", "Normal" } }, true, {})
        end,
      })
      vim.api.nvim_create_autocmd({ "User" }, {
        group = status_group,
        pattern = "CodeCompanionRequestStreaming",
        callback = function()
          vim.api.nvim_echo({ { "[AI] Streaming...", "Normal" } }, true, {})
        end,
      })
      vim.api.nvim_create_autocmd({ "User" }, {
        group = status_group,
        pattern = "CodeCompanionRequestFinished",
        callback = function()
          request_status.processing = false
          stop_spinner()
          vim.cmd("redrawstatus")
          vim.api.nvim_echo({ { "[AI] Done", "Normal" } }, true, {})
        end,
      })

      function CodeCompanionWinbar()
        local bufnr = vim.api.nvim_get_current_buf()
        local meta = _G.codecompanion_chat_metadata and _G.codecompanion_chat_metadata[bufnr]

        if not meta then
          return ""
        end

        local function hl(group, text)
          return string.format("%%#%s#%s%%*", group, text)
        end

        local parts = {}

        if meta.adapter then
          local name = meta.adapter.name or "unknown"
          local model = meta.adapter.model and meta.adapter.model:sub(1, 12) or ""

          local icon = request_status.processing and spinner_symbols[request_status.spinner_index] or "󰚩"
          local adapter_part = hl("String", icon) .. " " .. hl("Comment", name)
          local model_part = model ~= "" and ": " .. hl("Title", model) or ""
          table.insert(parts, adapter_part .. model_part)
        end

        if meta.tokens and meta.tokens > 0 then
          table.insert(parts, hl("Number", "󰬁 " .. meta.tokens))
        end

        if meta.cycles and meta.cycles > 0 then
          table.insert(parts, hl("Comment", " " .. meta.cycles))
        end

        local right = hl("Special", "ID:" .. (meta.id or "?"))

        return table.concat(parts, "  ") .. "%=" .. right
      end

      local group = vim.api.nvim_create_augroup("CodeCompanionWinbar", { clear = true })

      vim.api.nvim_create_autocmd("FileType", {
        group = group,
        pattern = "codecompanion",
        callback = function(args)
          vim.api.nvim_set_option_value(
            "winbar",
            "%{%v:lua.CodeCompanionWinbar()%}",
            { scope = "local", win = args.win or 0 }
          )
        end,
      })
    end,

    opts = {
      extensions = {},
      interactions = {
        cmd = {
          adapter = "bailian",
          model = "minimax-m2.5",
        },
        inline = {
          adapter = "bailian",
          model = "minimax-m2.5",
        },
        chat = {
          adapter = "bailian",
          model = "kimi-k2.5",
        },
      },
      opts = {
        language = "Chinese",
      },
      adapters = {
        http = {
          kimi = function()
            return require("codecompanion.adapters").extend("openai_compatible", {
              formatted_name = "Kimi",
              env = {
                api_key = "KIMI_CODE_KEY",
                url = "https://api.moonshot.cn",
              },
              schema = {
                model = {
                  default = "kimi-k2.5",
                },
              },
            })
          end,
          volcengine_coding = function()
            return require("codecompanion.adapters").extend("openai_compatible", {
              formatted_name = "Volcengine Coding",
              env = {
                api_key = "VOLCENGINE_API_KEY",
                url = "https://ark.cn-beijing.volces.com/api/coding",
                chat_url = "/v3/chat/completions",
                models_endpoint = "/v3/models",
              },
              schema = {
                model = {
                  default = "kimi-k2.5",
                  choices = {
                    "doubao-seed-code",
                    "kimi-k2.5",
                    "glm-4.7",
                    "deepseek-v3.2",
                    "doubao-seed-2.0-code",
                    "doubao-seed-2.0-pro",
                    "doubao-seed-2.0-lite",
                    "minimax-m2.5",
                  },
                },
              },
            })
          end,
          bailian = function()
            return require("codecompanion.adapters").extend("openai_compatible", {
              formatted_name = "Bailian",
              env = {
                api_key = "BAILIAN_API_KEY",
                url = "https://dashscope.aliyuncs.com/compatible-mode",
              },
              schema = {
                model = {
                  default = "MiniMax-M2.5",
                },
              },
            })
          end,
        },
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
