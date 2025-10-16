---@param params table Table containing message and allowed_words
---@return table The filtered message
local function filter_out_messages(params)
  local message = params.message

  local allowed = params.allowed_words

  for key, _ in pairs(message) do
    if not vim.tbl_contains(allowed, key) then
      message[key] = nil
    end
  end
  return message
end
return {
  {
    "olimorris/codecompanion.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      --[[ {
        "OXY2DEV/markview.nvim",
        ft = "codecompanion",
        lazy = false,
        opts = {
          preview = {
            filetypes = { "markdown", "codecompanion" },
            ignore_buftypes = {},
          },
        },
      }, ]]
      {
        "ravitemer/mcphub.nvim",
        config = function()
          require("mcphub").setup({
            port = 37373,
            config = vim.fn.stdpath("data") .. "/mcphub.json",
          })
        end,
      },

      {
        "echasnovski/mini.diff",
        ft = "codecompanion",
        config = function()
          local diff = require("mini.diff")
          diff.setup({
            -- Disabled by default
            source = diff.gen_source.none(),
          })
        end,
      },
      {
        "HakonHarnes/img-clip.nvim",
        ft = "codecompanion",
        opts = {
          filetypes = {
            codecompanion = {
              prompt_for_file_name = false,
              template = "[Image]($FILE_PATH)",
              use_absolute_path = true,
            },
          },
        },
      },
    },
    keys = {
      {
        "<leader>ac",
        function()
          require("codecompanion").chat()
        end,
        desc = "Code companion",
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
        chat = {
          adapter = "anthropic_with_bearer_token",
          model = "claude-3-7-sonnet-20250219",
        },
      },
      opts = {
        language = "Chinese",
      },
      adapters = {
        acp = {
          claude_code = function()
            return require("codecompanion.adapters").extend("claude_code", {
              env = {
                CLAUDE_CODE_OAUTH_TOKEN = "",
              },
            })
          end,
        },
        anthropic_with_bearer_token = function()
          local utils = require("codecompanion.utils.adapters")
          local tokens = require("codecompanion.utils.tokens")

          return require("codecompanion.adapters").extend("anthropic", {
            env = {
              bearer_token = "",
            },
            headers = {
              ["content-type"] = "application/json",
              ["authorization"] = "Bearer ",
              ["anthropic-version"] = "2023-06-01",
              ["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
            },
            handlers = {
              setup = function(self)
                -- Remove x-api-key header if it exists (from base adapter)
                if self.headers and self.headers["x-api-key"] then
                  self.headers["x-api-key"] = nil
                end
                -- Same as current setup function but removing the additional headers being added

                if self.opts and self.opts.stream then
                  self.parameters.stream = true
                end

                local model = self.schema.model.default
                local model_opts = self.schema.model.choices[model]
                if model_opts and model_opts.opts then
                  self.opts = vim.tbl_deep_extend("force", self.opts, model_opts.opts)
                  if not model_opts.opts.has_vision then
                    self.opts.vision = false
                  end
                end

                return true
              end,

              form_messages = function(self, messages)
                -- Same as current form_message but adding Claude Code system message at the first system message

                local has_tools = false

                local system = vim
                  .iter(messages)
                  :filter(function(msg)
                    return msg.role == "system"
                  end)
                  :map(function(msg)
                    return {
                      type = "text",
                      text = msg.content,
                      cache_control = nil,
                    }
                  end)
                  :totable()

                -- Add the Claude Code system message at the beginning (required to make it work)
                table.insert(system, 1, {
                  type = "text",
                  text = "You are Claude Code, Anthropic's official CLI for Claude.",
                  cache_control = {
                    type = "ephemeral",
                  },
                })

                system = next(system) and system or nil

                messages = vim
                  .iter(messages)
                  :filter(function(msg)
                    return msg.role ~= "system"
                  end)
                  :totable()

                messages = vim.tbl_map(function(message)
                  if message.opts and message.opts.tag == "image" and message.opts.mimetype then
                    if self.opts and self.opts.vision then
                      message.content = {
                        {
                          type = "image",
                          source = {
                            type = "base64",
                            media_type = message.opts.mimetype,
                            data = message.content,
                          },
                        },
                      }
                    else
                      return nil
                    end
                  end

                  message = filter_out_messages({
                    message = message,
                    allowed_words = { "content", "role", "reasoning", "tool_calls" },
                  })

                  if message.role == self.roles.user or message.role == self.roles.llm then
                    if message.role == self.roles.user and message.content == "" then
                      message.content = "<prompt></prompt>"
                    end

                    if type(message.content) == "string" then
                      message.content = {
                        { type = "text", text = message.content },
                      }
                    end
                  end

                  if message.tool_calls and vim.tbl_count(message.tool_calls) > 0 then
                    has_tools = true
                  end

                  if message.role == "tool" then
                    message.role = self.roles.user
                  end

                  if has_tools and message.role == self.roles.llm and message.tool_calls then
                    message.content = message.content or {}
                    for _, call in ipairs(message.tool_calls) do
                      table.insert(message.content, {
                        type = "tool_use",
                        id = call.id,
                        name = call["function"].name,
                        input = vim.json.decode(call["function"].arguments),
                      })
                    end
                    message.tool_calls = nil
                  end

                  if message.reasoning and type(message.content) == "table" then
                    table.insert(message.content, 1, {
                      type = "thinking",
                      thinking = message.reasoning.content,
                      signature = message.reasoning._data.signature,
                    })
                  end

                  return message
                end, messages)

                messages = utils.merge_messages(messages)

                if has_tools then
                  for _, m in ipairs(messages) do
                    if m.role == self.roles.user and m.content and m.content ~= "" then
                      if type(m.content) == "table" and m.content.type then
                        m.content = { m.content }
                      end

                      if type(m.content) == "table" and vim.islist(m.content) then
                        local consolidated = {}
                        for _, block in ipairs(m.content) do
                          if block.type == "tool_result" then
                            local prev = consolidated[#consolidated]
                            if prev and prev.type == "tool_result" and prev.tool_use_id == block.tool_use_id then
                              prev.content = prev.content .. block.content
                            else
                              table.insert(consolidated, block)
                            end
                          else
                            table.insert(consolidated, block)
                          end
                        end
                        m.content = consolidated
                      end
                    end
                  end
                end

                local breakpoints_used = 0
                for i = #messages, 1, -1 do
                  local msgs = messages[i]
                  if msgs.role == self.roles.user then
                    for _, msg in ipairs(msgs.content) do
                      if msg.type ~= "text" or msg.text == "" then
                        goto continue
                      end
                      if
                        tokens.calculate(msg.text) >= self.opts.cache_over
                        and breakpoints_used < self.opts.cache_breakpoints
                      then
                        msg.cache_control = { type = "ephemeral" }
                        breakpoints_used = breakpoints_used + 1
                      end
                      ::continue::
                    end
                  end
                end
                if system and breakpoints_used < self.opts.cache_breakpoints then
                  for _, prompt in ipairs(system) do
                    if breakpoints_used < self.opts.cache_breakpoints then
                      prompt.cache_control = { type = "ephemeral" }
                      breakpoints_used = breakpoints_used + 1
                    end
                  end
                end

                return { system = system, messages = messages }
              end,
            },
          })
        end,
      },
    },
  },
}
