local later = require("q").later
local autocmd = Jili.autocmd
local keymap = Jili.keymap

later(function()
	vim.pack.add({
		"https://github.com/nvim-mini/mini.files",
	})

	local minifiles = require("mini.files")
	minifiles.setup({
		mappings = {
			go_in_plus = "<cr>",
		},
	})

	local map_split = function(buf_id, lhs, direction)
		local rhs = function()
			local cur_target = minifiles.get_explorer_state().target_window
			local new_target = vim.api.nvim_win_call(cur_target, function()
				vim.cmd(direction .. " split")
				return vim.api.nvim_get_current_win()
			end)

			minifiles.set_target_window(new_target)

			minifiles.go_in({
				close_on_file = true,
			})
		end

		local desc = "Split " .. direction
		keymap("n", lhs, rhs, { buffer = buf_id, desc = desc })
	end

	local yank_path = function(modifiers)
		local path = (minifiles.get_fs_entry() or {}).path
		if path == nil then
			return vim.notify("Cursor is not on valid entry")
		end
		vim.fn.setreg(vim.v.register, vim.fn.fnamemodify(path, modifiers))
	end

	local ui_open = function()
		vim.ui.open(minifiles.get_fs_entry().path)
	end

	autocmd("User", {
		pattern = "MiniFilesBufferCreate",
		callback = function(args)
			local buf_id = args.data.buf_id

			map_split(buf_id, "<C-v>", "belowright vertical")
			map_split(buf_id, "<C-t>", "tab")

			keymap("n", "gx", ui_open, { buffer = buf_id, desc = "OS open" })
			keymap("n", "gy", function()
				yank_path(":.")
			end, { buffer = buf_id, desc = "Yank path" })
			keymap("n", "gY", function()
				yank_path(":p")
			end, { buffer = buf_id, desc = "Yank path" })
			keymap("i", "<c-s>", "<esc><cmd>lua MiniFiles.synchronize()<cr>", { buffer = buf_id, desc = "Yank path" })
		end,
	})

	local last_buf_name
	keymap("n", "<leader>e", function()
		local bufname = vim.api.nvim_buf_get_name(0)
		local path = vim.fn.fnamemodify(bufname, ":p")

		if path and vim.uv.fs_stat(path) then
			last_buf_name = bufname
			minifiles.open(bufname, false)
		else
			if last_buf_name then
				minifiles.open(last_buf_name, false)
			else
				local cwd = vim.fn.getcwd()
				last_buf_name = cwd
				minifiles.open(cwd, false)
			end
		end
	end, {
		desc = "File explorer",
	})
end)
