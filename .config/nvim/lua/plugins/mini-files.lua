local last_buf_name
return {
  "nvim-mini/mini.files",
  config = function()
    require("mini.files").setup({
      mappings = {
        go_in_plus = "<cr>",
        synchronize = "<c-s>",
      },
    })
    local map_split = function(buf_id, lhs, direction)
      local rhs = function()
        -- Make new window and set it as target
        local cur_target = MiniFiles.get_explorer_state().target_window
        local new_target = vim.api.nvim_win_call(cur_target, function()
          vim.cmd(direction .. " split")
          return vim.api.nvim_get_current_win()
        end)

        MiniFiles.set_target_window(new_target)

        -- This intentionally doesn't act on file under cursor in favor of
        -- explicit "go in" action (`l` / `L`). To immediately open file,
        -- add appropriate `MiniFiles.go_in()` call instead of this comment.
        MiniFiles.go_in({
          close_on_file = true,
        })
      end

      -- Adding `desc` will result into `show_help` entries
      local desc = "Split " .. direction
      vim.keymap.set("n", lhs, rhs, { buffer = buf_id, desc = desc })
    end

    vim.api.nvim_create_autocmd("User", {
      pattern = "MiniFilesBufferCreate",
      callback = function(args)
        local buf_id = args.data.buf_id
        -- Tweak keys to your liking
        -- map_split(buf_id, "<C-s>", "belowright horizontal")
        map_split(buf_id, "<C-v>", "belowright vertical")
        map_split(buf_id, "<C-t>", "tab")
      end,
    })

    -- Yank in register full path of entry under cursor
    local yank_path = function()
      local path = (MiniFiles.get_fs_entry() or {}).path
      if path == nil then
        return vim.notify("Cursor is not on valid entry")
      end
      vim.fn.setreg(vim.v.register, path)
    end

    -- Open path with system default handler (useful for non-text files)
    local ui_open = function()
      vim.ui.open(MiniFiles.get_fs_entry().path)
    end

    vim.api.nvim_create_autocmd("User", {
      pattern = "MiniFilesBufferCreate",
      callback = function(args)
        local b = args.data.buf_id
        vim.keymap.set("n", "gx", ui_open, { buffer = b, desc = "OS open" })
        vim.keymap.set("n", "gy", yank_path, { buffer = b, desc = "Yank path" })
        vim.keymap.set("i", "<c-s>", "<esc><cmd>lua MiniFiles.synchronize()<cr>", { buffer = b, desc = "Yank path" })
      end,
    })

    vim.api.nvim_create_autocmd("User", {
      desc = "Notify LSPs that a file was renamed",
      pattern = { "MiniFilesActionRename", "MiniFilesActionMove" },
      callback = function(args)
        local changes = {
          files = {
            {
              oldUri = vim.uri_from_fname(args.data.from),
              newUri = vim.uri_from_fname(args.data.to),
            },
          },
        }
        local will_rename_method, did_rename_method = "workspace/willRenameFiles", "workspace/didRenameFiles"
        local clients = vim.lsp.get_clients()
        for _, client in ipairs(clients) do
          if client:supports_method(will_rename_method) then
            local res = client:request_sync(will_rename_method, changes, 1000, 0)
            if res and res.result then
              vim.lsp.util.apply_workspace_edit(res.result, client.offset_encoding)
            end
          end
        end

        for _, client in ipairs(clients) do
          if client:supports_method(did_rename_method) then
            client:notify(did_rename_method, changes)
          end
        end
      end,
    })
  end,
  keys = {
    {
      "<leader>e",
      function()
        local bufname = vim.api.nvim_buf_get_name(0)
        local path = vim.fn.fnamemodify(bufname, ":p")

        -- Noop if the buffer isn't valid.
        if path and vim.uv.fs_stat(path) then
          last_buf_name = bufname
          require("mini.files").open(bufname, false)
        else
          if last_buf_name then
            require("mini.files").open(last_buf_name, false)
          else
            local cwd = vim.fn.getcwd()
            last_buf_name = cwd
            require("mini.files").open(cwd, false)
          end
        end
      end,
      desc = "File explorer",
    },
  },
}
